# MyLife Journal

A personal life journal web app: log events, memories, books, films, travels and
more — with photos, tags, ratings, a calendar view, stats, and an importer for
bringing in data from other apps.

## Stack

- Frontend: Vite + React + TypeScript, Tailwind CSS, PWA (vite-plugin-pwa)
- Backend: Vercel serverless functions (`api/`), Neon Postgres via Drizzle ORM
- Images: Vercel Blob
- Auth: single-owner password + HMAC-SHA256 session cookie
- Data fetching: TanStack Query, forms with React Hook Form + zod

## Setup

### 1. Create the Neon database

1. Create a project at [Neon](https://neon.tech) and copy the pooled connection string.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Apply migrations: run the SQL files in `drizzle/` in filename order against
   your Neon database (base migration first, then the seed migration). You can
   paste them into the Neon SQL editor, or use `drizzle-kit migrate` with
   `DATABASE_URL` set.

### 2. Create the Blob store

1. In the Vercel dashboard: Storage → Blob → create a store.
2. Copy the read-write token into `BLOB_READ_WRITE_TOKEN` (in `.env` for local
   dev, in the Vercel project settings for production).

### 3. Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | yes | Vercel Blob read-write token |
| `SESSION_SECRET` | yes | Random secret (`openssl rand -hex 32`) for session HMAC |
| `OWNER_PASSWORD_HASH` | yes | bcrypt hash of the owner password — see below |
| `MAX_IMAGE_MB` | no | Max upload size in MB (default `10`) |
| `VITE_APP_NAME` | no | Public app name (default `MyLife Journal`) |

On Vercel, set these in Project Settings → Environment Variables.

### 4. Generate the owner password hash

```bash
MYLIFE_PASSWORD="your-secret-password" npm run hash-password
```

Paste the printed hash into `OWNER_PASSWORD_HASH`.

### 5. Run migrations

Apply the SQL files in `drizzle/` in filename order (base migration first, then
the seed migration). See "1. Create the Neon database" above.

### 6. Dev

```bash
npm install
npm run dev
```

### 7. Deploy

Push to GitHub, import the repo in Vercel (the build is `npm run build`, the
SPA rewrite is in `vercel.json`; `/api/*` routes take precedence automatically).
Set the environment variables in the Vercel project settings before the first
deploy.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (app + node projects) and production build
- `npm run typecheck` — `tsc --noEmit -p tsconfig.app.json`
- `npm test` — vitest (unit/integration)
- `npm run test:e2e` — Playwright end-to-end
- `npm run db:generate` — regenerate Drizzle migrations from the schema
- `npm run hash-password` — hash the owner password (`MYLIFE_PASSWORD=...`)

## API

All routes live under `api/` as Vercel serverless functions. Every route
requires authentication (private journal); state-changing routes also pass a
same-origin CSRF check (`checkCsrf`). Responses are `{ data: ... }` on success
and `{ error: { code, message, details? } }` on failure.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{ password }` → sets the `mylife_session` cookie. 401 on bad password (generic message), 429 `rate_limited` after 5 attempts / 10 min per IP, 500 `misconfigured` when `OWNER_PASSWORD_HASH`/`SESSION_SECRET` are missing |
| POST | `/api/auth/logout` | Clears the session cookie |
| GET | `/api/auth/me` | `{ authenticated: true }` when the session is valid |

> **Rate-limit caveat:** the login limiter is in-memory per serverless instance.
> On Vercel, functions scale to N instances, so a distributed attacker gets ~5
> attempts per instance per window. This is a pragmatic baseline for a
> single-owner app; a DB-backed sliding-window limiter is the future upgrade
> path if brute-force becomes a concern.

### Entries

| Method | Path | Description |
|---|---|---|
| GET | `/api/entries` | List with filters: `search` (ILIKE on title+description, wildcards escaped), `category` (slug), `year`, `month` (requires `year`), `from`/`to` (`YYYY-MM-DD`), `rating` (1–5), `hasPhotos` (`true`/`false`), `page`, `limit` (≤100), `sort` (`asc`/`desc`). Ordered by `event_date`, then `created_at`, then `id`. → `{ items: EntryDTO[], total, page, limit }` |
| POST | `/api/entries` | Create entry (201). Body: `event_date`, `title`, `description?`, `category_id`, `rating?`, `location?`, `tags?` (upserted), `photos?` (`{pathname, thumbnailPathname?, url?, thumbnailUrl?, altText?, sortOrder?}`) |
| GET | `/api/entries/[id]` | One entry → `EntryDTO` (404 when missing) |
| PATCH | `/api/entries/[id]` | Partial update. `photos` present (even `[]`) = full replacement: old image rows are deleted and their blob objects removed (best-effort). `tags` present = full replacement. `updated_at` is bumped |
| DELETE | `/api/entries/[id]` | Deletes the entry (image rows cascade); associated blob objects are deleted best-effort → `{ ok: true }` |

`EntryDTO`: `{ id, event_date, title, description, category: CategoryDTO,
rating, location, source, source_entry_id, tags: string[], photos:
EntryPhotoDTO[], created_at, updated_at }`.
`event_date` is a SQL `DATE` and is always handled as a `YYYY-MM-DD` string —
never parsed into a JS `Date` (avoids timezone shifts).

### Calendar / stats / tags / categories

| Method | Path | Description |
|---|---|---|
| GET | `/api/calendar?year=&month=` | Single SQL query: `{ year, month, days: [{ date, count, categories: [{slug,color}] }] }` — only days with entries |
| GET | `/api/stats` | `{ totalEntries, yearsActive, byCategory, totalPhotos, perYear, books, movies, trips }` (`books`/`movies`/`trips` count the `libros`/`peliculas`/`viajes` slugs, 0 when missing) |
| GET | `/api/tags` | `[{ id, name, count }]` ordered by count desc, limit 200 |
| GET | `/api/categories` | All categories ordered by `sort_order`, each with `entry_count` |
| POST | `/api/categories` | Create (201); duplicate slug → 409 `conflict` |
| PATCH | `/api/categories/[id]` | Partial update; slug change to a taken slug → 409 |
| DELETE | `/api/categories/[id]` | Entries block deletion → 409 `category_in_use` with `{ entryCount }`; pass `?reassignTo=<uuid>` (a different, existing category) to move entries first |

### Images (Vercel Blob)

| Method | Path | Description |
|---|---|---|
| POST | `/api/images/upload` | **JSON + base64, not multipart.** `{ fileName, contentType, data, thumbnail? }`. Validates content-type whitelist (`image/jpeg|png|webp`), magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`), and decoded size ≤ `MAX_IMAGE_MB` (default 10; body parser limit is 4 MB). Uploads to `entries/<uuid>/img.<ext>` (+ `thumb.<ext>`) with `addRandomSuffix: true` → 201 `{ pathname, url, thumbnailPathname, thumbnailUrl }` |
| DELETE | `/api/images/[id]` | `:id` is an `entry_images` row id → deletes blob objects (best-effort) + row (404 when missing) |

> **Privacy model:** every upload gets a 128-bit random pathname, so URLs are
> effectively unguessable — there is no public listing. Blob URLs are only
> ever exposed through authenticated API responses; the frontend never
> hardcodes blob hostnames. The resolved public URL is stored in
> `entry_images.url`/`thumbnail_url` (migration `0002_image_urls`) so `<img>`
> tags can render without extra round-trips. This is the pragmatic
> free-tier model (no signed URLs on the free tier): obscurity + auth-gated
> responses. API routes also serve `noindex` so leaked URLs are not indexed.

### Import (batched)

The importer is designed for large migrations (e.g. Diaro exports): the client
creates a job, POSTs batches of ≤50 items, then completes the job. Batches are
**idempotent** — re-sending the same batch yields `duplicate` results, never
double inserts, enforced by the partial unique index
`entries_source_unique_idx (source, source_entry_id)`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/import/preview` | `{ source, items: [{source_entry_id, event_date, title}] }` (≤5000) → `{ total, newCount, duplicates: [source_entry_id], dateRange: {min,max} }` (dry run) |
| POST | `/api/import/jobs` | `{ source, fileName?, totalItems }` → 201 job row |
| GET | `/api/import/jobs` | Last 20 jobs, newest first |
| GET | `/api/import/jobs/[id]` | `{ job, items: [{source_entry_id, status, error_message}] }` (items ≤5000) |
| POST | `/api/import/jobs/[id]/batch` | `{ items: [batchItem] }` (1–50). `batchItem`: `{ source_entry_id, event_date, title, description?, category_id? XOR category?: {slug,name,color?,icon?}, rating?, location?, tags?, photos? }`. Category resolution: by id (must exist) → by slug (find-or-create) → fallback to `otros`, then first category by `sort_order`. Each item becomes `imported` (new entry), `duplicate` (already imported — including lost races on the unique index), or `failed` (recorded with `error_message`; the batch keeps going). Job counters + `checkpoint.lastBatchAt` are updated; status → `running` → `{ results: [{source_entry_id, status, entry_id?, error?}] }` |
| POST | `/api/import/jobs/[id]/complete` | Marks the job `completed` → `{ report: { total, imported, duplicates, failed, errors: [{source_entry_id, error_message}] } }` (failed items only, ≤100) |

> **Design note:** the Neon HTTP driver has no interactive transactions, so a
> batch is processed with sequential awaits — each item is atomic on its own,
> but a batch is *not* all-or-nothing. Failed items are recorded and surfaced
> in the completion report for inspection/retry.

### Export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/json?page=&limit=` | Paginated backup (default 1/200, max 500): `{ version: 1, exportedAt, categories, tags: string[], entries: EntryDTO[], pagination: {page,limit,total} }`. The client assembles the full backup and fetches photo blobs into a ZIP |
| GET | `/api/export/csv` | All entries (cap 20000) as `text/csv` download (`mylife-export-YYYY-MM-DD.csv`): `id,event_date,title,description,category_slug,rating,location,tags` (pipe-separated), `photo_count,created_at` — RFC 4180 escaping |

## Importing from Diaro

See [docs/DIARO_IMPORT.md](docs/DIARO_IMPORT.md) for the full guide. Short version:

1. In the Diaro app, create a backup (this produces a ZIP containing
   `DiaroBackup.xml` plus `media/photo/` with all attachment photos).
2. Open **Import** in MyLife Journal and upload the ZIP — nothing is sent
   anywhere except your own server.
3. The app parses the backup locally, shows a preview (entry count, date
   range, detected folders, photo count, duplicates already in your journal),
   and lets you map Diaro folders to journal categories (or create new ones).
4. Confirm to run the import: photos are resized in the browser, uploaded to
   your Blob store, and entries are inserted in idempotent batches
   (re-running the same file yields `duplicate`, never double entries).
   Interrupted imports resume from the job's checkpoint.

CSV, JSON and TXT adapters are also supported for smaller ad-hoc imports.

## PWA & offline

- Installable (manifest + icons in `public/icons/`, generated by
  `scripts/gen-icons.mjs` — a zero-dependency PNG writer).
- The service worker precaches **only build assets**. API responses and blob
  image URLs are served `NetworkOnly` — private data is never persisted in
  the SW cache.
- The UI shows an online/offline indicator; the editor autosaves drafts to
  IndexedDB (marked "Borrador local") and restores them if you leave
  mid-edit.

## Project layout

- `server/lib/` — shared backend libs: `schema.ts` (Drizzle tables), `db.ts`
  (Neon client), `auth.ts` (session/CSRF/rate-limit), `respond.ts` (JSON
  helpers), `validate.ts` (zod schemas, also imported by the browser),
  `types.ts` (DTO types, zero runtime imports), `blob.ts` (Vercel Blob),
  `entry-dto.ts` (EntryDTO assembly, tag/photo helpers — node-only)
- `server/handlers/` — one module per API endpoint (default-exported
  handler); `api/` holds only 11 thin routers (`[...all].ts` catch-alls per
  resource plus `entries.ts`, `categories.ts`, `calendar.ts`, `stats.ts`,
  `tags.ts`) to stay within the Vercel Hobby 12-function limit — public
  `/api/*` URLs are unchanged
- `drizzle/` — migrations (`0000` base, `0001` category seed, `0002` image URL
  columns); snapshots under `drizzle/meta` are kept in sync by hand
  (`npx drizzle-kit check` must stay clean — do not run `db:generate`)
- `src/` — React frontend
- `scripts/hash-password.mjs` — owner password hashing helper
