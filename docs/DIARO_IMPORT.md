# Diaro Import

Client-side importer for the official **Diaro** (diaroapp.com) Android/iOS app
backups, plus generic CSV / JSON / TXT fallbacks. Implementation lives in
`src/lib/import/`; the UI entry point is the ImportPage (frontend agent) and
the server endpoints are `/api/import/*` (backend agent).

## How the user exports from Diaro

1. Open the Diaro app → **Settings → Backup**.
2. Create a backup and choose **"Export to ZIP"** (or share the backup file).
3. The resulting ZIP contains:
   - `DiaroBackup.xml` — the database dump,
   - `media/photo/<filename>` — **all** attachment photos.

The user picks that ZIP in the ImportPage. Everything else happens in the
browser: parse → preview → upload photos → create entries.

## What the importer reads

`DiaroBackup.xml` is `<data version="2">` with `<table name="…">` sections of
`<r>` rows (schema verified against the twaugh/diaro-render reference; the
parser code in `src/lib/import/diaro-xml.ts` is our own implementation):

| Table              | Columns used                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `diaro_entries`    | `uid`, `date` (epoch millis), `tz_offset`, `title`, `text`, `folder_uid`, `location_uid`, `tags`, `primary_photo_uid` |
| `diaro_attachments`| `uid`, `entry_uid`, `type`, `filename`, `position`                    |
| `diaro_folders`    | `uid`, `title`, `color`                                               |
| `diaro_locations`  | `uid`, `title`, `address`                                             |
| `diaro_tags`       | `uid`, `title`                                                        |

`diaro_templates` / `diaro_moods` and unknown tables are ignored.

## Field mapping (Diaro → MyLife)

| Diaro                                  | MyLife `NormalizedEntry`                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| `uid`                                  | `sourceEntryId` = uid **without prefix** (server receives `source='diaro'` separately; the `(source, source_entry_id)` unique index dedupes) |
| `date` millis + `tz_offset`            | `eventDate`: wall-clock calendar date in the entry's own timezone → `new Date(millis + tzOffsetMin*60000)`, take UTC Y/M/D. `tz_offset` is parsed from `"+HH:MM"` strings and plain minute counts |
| `title`                                | `title`                                                               |
| `text`                                 | `description`, newlines preserved exactly                             |
| `folder_uid` → folder `title`          | `categoryHint` (folder title, or `null`)                              |
| `tags` column (tag UIDs, comma-separated) → tag titles | `tags[]` (unknown tokens pass through as-is)              |
| `location_uid` → `title` + `address`   | `location`: `"title, address"` (or whichever part exists)              |
| —                                      | `rating`: always `null` — Diaro's `mood` column holds a `diaro_moods` UID (emoji preset), not a 1–5 scale, so it is intentionally not mapped |
| attachments with `type` = `photo`/`image`/`image/*`, primary first then by `position` | `photos[]`: `media/photo/<filename>` resolved case-insensitively (also under nested paths). **Missing photo files are skipped with a warning — never invented** |
| non-photo attachments (video, audio…) | skipped with a warning                                                |

`folders[]` in the parse result carries each Diaro folder as `{ id, title, color }`
so the UI can pre-fill the category mapping step.

## CSV / JSON / TXT fallbacks

- **CSV**: header row required with a `date|fecha` column. Also recognized:
  `title|titulo`, `description|descripcion|texto`, `category|categoria|folder`,
  `tags|etiquetas` (comma/semicolon separated), `location|ubicacion`,
  `rating|valoracion`. Dates: `YYYY-MM-DD`, then `DD/MM/YYYY` (day-first),
  then `MM/DD/YYYY`; all validated as real calendar dates. Rows with bad
  dates are skipped with a warning. Title falls back to the first description
  line (reported in warnings).
- **JSON**: top-level array or `{ "entries": [...] }`; fields
  `date|event_date`, `title`, `description|text`, `category|folder`, `tags[]`,
  `location`, `rating`.
- **TXT**: blocks split on blank lines; leading `Date:` / `Title:` directives
  and `#hashtag` tags; the rest is the description. Blocks without a
  parseable date are skipped with a warning.

`sourceEntryId` for these formats is `csv:<row>` / `json:<index>` /
`txt:<block>` — deterministic per file. The UI should pass
`source: 'csv' | 'json' | 'txt'` to `runImport` accordingly.

## Idempotency & resume

- The server dedupes on `(source, source_entry_id)`. Re-running the same file
  **never creates double entries**: already-imported entries come back as
  `duplicates` in the report.
- `runImport` always creates a **new** import job. If a run is aborted (the
  `AbortSignal` throws between chunks/uploads), the server-side job keeps its
  checkpoint; the client simply starts a fresh `runImport` — already-sent
  entries are counted as duplicates, not duplicated.
- Photos are deduplicated client-side by `Blob` identity before upload.

## Limitations

- **Videos and audio attachments are skipped** (with a warning); only images
  are imported.
- **HEIC photos** cannot be decoded by the browser canvas and are skipped
  with a warning. (Diaro on Android exports JPEG/PNG; HEIC mainly appears in
  iOS-side conversions.)
- **Weather and mood are not imported.** Weather columns (`weather_temperature`,
  `weather_icon`, `weather_description`) have no MyLife equivalent, and
  `mood` is a Diaro preset UID, not a 1–5 rating.
- Photo upload resizes to **max 1600px, WebP q0.8** with a **480px thumbnail**
  (JPEG fallback on old Safari); originals are not kept server-side.
- Tag resolution: the `tags` column is expected to hold tag UIDs (per real
  exports); if an export stores literal titles instead, they pass through
  unchanged.

## For developers

```ts
import { detectFormat, parseFile, analyzeLocal, runImport } from '@/lib/import';

const format = await detectFormat(file);            // 'diaro-zip' | 'csv' | 'json' | 'txt' | 'unknown'
const parsed = await parseFile(file, (pct) => …);   // { entries, folders, warnings }
const stats = analyzeLocal(parsed.entries);         // preview numbers, no network

const report = await runImport({
  entries: parsed.entries,
  categoryMapping: { 'Test Folder': 'cat_123', __default__: 'cat_123' },
  source: 'diaro',
  fileName: file.name,
  photoConcurrency: 3,
  onProgress: (done, total, phase) => …,            // phase: 'photos' | 'entries' | 'done'
  signal,
});
```

Backend response-shape assumptions (defensive parsing in `runner.ts`):
create-job accepts `{ jobId } | { id } | { job: { id } }`; batch results
`{ results: [{ source_entry_id, status: 'imported'|'duplicate'|'failed', message? }] }`
or a summary `{ imported, duplicates, failed, errors }`; complete returns an
`ImportReport`-shaped object, with local tallies as fallback.

Test fixture: `tests/fixtures/diaro-sample.xml` (fully synthetic: "Test Entry
One", 2 entries, 1 folder, 1 tag, 1 location, 2 attachments with the primary
photo deliberately listed at a worse `position` to exercise primary-first
ordering).
