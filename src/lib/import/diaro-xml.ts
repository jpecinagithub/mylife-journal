/**
 * Parser for the official Diaro Android app backup format.
 *
 * The backup is a ZIP containing:
 *   - DiaroBackup.xml            (the database dump, <data version="2">)
 *   - media/photo/<filename>     (every attachment photo)
 *
 * XML schema notes (verified against the twaugh/diaro-render reference,
 * which the official format is parsed from; mapping logic below is our own):
 *   <data version="2"> -> <table name="..."> -> <r> rows -> one child element
 *   per property.
 *   - diaro_entries:    uid, date (epoch millis), tz_offset ("+01:00" or
 *                       minutes), title, text, folder_uid, location_uid,
 *                       tags (comma-separated tag UIDs), primary_photo_uid,
 *                       weather_*, mood (a diaro_moods UID, not a 1-5 scale)
 *   - diaro_attachments: uid, entry_uid, type ("photo"), filename, position
 *   - diaro_folders:     uid, title, color, pattern
 *   - diaro_locations:   uid, title, address, lat, lng, zoom
 *   - diaro_tags:        uid, title
 *   - diaro_templates / diaro_moods are ignored.
 *
 * Entry dates are stored as UTC epoch millis; tz_offset records the wall
 * clock offset where the entry was written. The normalized eventDate is the
 * calendar date the user saw: millis + offset -> UTC Y/M/D.
 */

import JSZip from 'jszip';
import type {
  ImportFolder,
  NormalizedEntry,
  ParsedImport,
  PhotoInput,
  ProgressCallback,
} from './types.js';

/* ------------------------------------------------------------------ */
/* Message constants (English; the UI translates before display).      */
/* ------------------------------------------------------------------ */

const MSG_XML_NOT_FOUND = 'DiaroBackup.xml not found inside the ZIP file';
const MSG_XML_INVALID = 'DiaroBackup.xml could not be parsed as XML';
const MSG_XML_BAD_ROOT = 'DiaroBackup.xml is not a Diaro <data version="2"> document';
const MSG_PHOTO_MISSING = 'Photo file not found in backup, skipped: ';
const MSG_MEDIA_SKIPPED = 'Non-photo attachment skipped: ';
const MSG_FOLDER_UNKNOWN = 'Entry references an unknown folder UID, folder ignored: ';
const MSG_LOCATION_UNKNOWN = 'Entry references an unknown location UID, location ignored: ';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Parse a Diaro tz_offset value into minutes.
 * Seen in the wild as "+01:00" / "-05:30" strings (diaro-render fixtures)
 * and as plain minute counts ("60"). Returns 0 when unparseable.
 */
function parseTzOffsetMinutes(raw: string | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  const hms = /^([+-])(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (hms) {
    const sign = hms[1] === '-' ? -1 : 1;
    return sign * (parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10));
  }
  const numeric = /^([+-]?\d+)$/.exec(trimmed);
  if (numeric) return parseInt(numeric[1], 10);
  return 0;
}

/** 'photo', 'image', or an 'image/*' MIME type counts as an image. */
function isImageAttachment(type: string | undefined): boolean {
  if (!type) return false;
  const t = type.trim().toLowerCase();
  return t === 'photo' || t === 'image' || t.startsWith('image/');
}

function splitTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/* ------------------------------------------------------------------ */
/* XML reading                                                          */
/* ------------------------------------------------------------------ */

type DiaroRow = Record<string, string>;

function readRows(table: Element): DiaroRow[] {
  const rows: DiaroRow[] = [];
  for (const r of table.getElementsByTagName('r')) {
    if (r.parentElement !== table) continue; // ignore nested <r> elements
    const row: DiaroRow = {};
    for (const child of Array.from(r.children)) {
      // First occurrence wins (diaro-render warns on duplicates too).
      if (!(child.tagName in row)) {
        row[child.tagName] = (child.textContent ?? '').trim();
      }
    }
    rows.push(row);
  }
  return rows;
}

type DiaroTables = {
  entries: DiaroRow[];
  attachments: DiaroRow[];
  folders: DiaroRow[];
  locations: DiaroRow[];
  tags: DiaroRow[];
};

function readTables(doc: XMLDocument): DiaroTables {
  const root = doc.documentElement;
  if (!root || root.tagName !== 'data' || root.getAttribute('version') !== '2') {
    throw new Error(MSG_XML_BAD_ROOT);
  }
  const tables: DiaroTables = { entries: [], attachments: [], folders: [], locations: [], tags: [] };
  for (const table of Array.from(root.children)) {
    if (table.tagName !== 'table') continue;
    const name = table.getAttribute('name');
    const rows = readRows(table);
    if (name === 'diaro_entries') tables.entries = rows;
    else if (name === 'diaro_attachments') tables.attachments = rows;
    else if (name === 'diaro_folders') tables.folders = rows;
    else if (name === 'diaro_locations') tables.locations = rows;
    else if (name === 'diaro_tags') tables.tags = rows;
    // diaro_templates, diaro_moods and unknown tables are ignored.
  }
  return tables;
}

/* ------------------------------------------------------------------ */
/* Media lookup inside the ZIP                                          */
/* ------------------------------------------------------------------ */

/**
 * Find the zip entry for media/photo/<filename>.
 * The official layout is media/photo/<filename> at the archive root, but we
 * also accept a nested path and case variants of the directory names.
 */
function findPhotoEntry(zip: JSZip, fileName: string): JSZip.JSZipObject | null {
  const exact = zip.file('media/photo/' + fileName);
  if (exact) return exact;
  const wanted = 'media/photo/' + fileName.toLowerCase();
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    if (path.toLowerCase().endsWith(wanted)) return entry;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Main parser                                                          */
/* ------------------------------------------------------------------ */

export async function parseDiaroZip(
  file: File | Blob,
  onProgress?: ProgressCallback,
): Promise<ParsedImport> {
  onProgress?.(5);
  const zip = await JSZip.loadAsync(file);

  // Locate DiaroBackup.xml (case-insensitive, may sit in a subfolder).
  let xmlEntry: JSZip.JSZipObject | null = null;
  for (const path of Object.keys(zip.files)) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    if (/(^|\/)diarobackup\.xml$/i.test(path)) {
      xmlEntry = entry;
      break;
    }
  }
  if (!xmlEntry) throw new Error(MSG_XML_NOT_FOUND);

  onProgress?.(15);
  const xmlText = await xmlEntry.async('text');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(MSG_XML_INVALID);
  }
  const tables = readTables(doc);
  onProgress?.(30);

  // Build lookup maps.
  const folderByUid = new Map<string, { title: string; color?: string }>();
  for (const row of tables.folders) {
    if (row.uid) folderByUid.set(row.uid, { title: row.title ?? '', color: row.color || undefined });
  }
  const tagTitleByUid = new Map<string, string>();
  for (const row of tables.tags) {
    if (row.uid) tagTitleByUid.set(row.uid, row.title ?? '');
  }
  const locationByUid = new Map<string, { title: string; address: string }>();
  for (const row of tables.locations) {
    if (row.uid) locationByUid.set(row.uid, { title: row.title ?? '', address: row.address ?? '' });
  }
  const attachmentsByEntry = new Map<string, DiaroRow[]>();
  for (const row of tables.attachments) {
    if (!row.entry_uid) continue;
    const list = attachmentsByEntry.get(row.entry_uid) ?? [];
    list.push(row);
    attachmentsByEntry.set(row.entry_uid, list);
  }
  onProgress?.(40);

  const warnings: string[] = [];
  const folders: ImportFolder[] = Array.from(folderByUid.entries()).map(([id, f]) => ({
    id,
    title: f.title,
    color: f.color,
  }));

  const entries: NormalizedEntry[] = [];
  const totalRows = tables.entries.length;

  for (let i = 0; i < totalRows; i++) {
    const row = tables.entries[i];

    // --- eventDate: wall-clock date in the entry's own timezone ----------
    const millis = Number(row.date);
    const offsetMinutes = parseTzOffsetMinutes(row.tz_offset);
    const wallClock = new Date(Number.isFinite(millis) ? millis + offsetMinutes * 60000 : 0);
    const eventDate = Number.isFinite(millis)
      ? `${wallClock.getUTCFullYear()}-${pad2(wallClock.getUTCMonth() + 1)}-${pad2(wallClock.getUTCDate())}`
      : '1970-01-01';

    // --- folder -> categoryHint -----------------------------------------
    let categoryHint: string | null = null;
    if (row.folder_uid) {
      const folder = folderByUid.get(row.folder_uid);
      if (folder) categoryHint = folder.title || null;
      else warnings.push(MSG_FOLDER_UNKNOWN + row.folder_uid);
    }

    // --- location: "title, address" --------------------------------------
    let location: string | null = null;
    if (row.location_uid) {
      const loc = locationByUid.get(row.location_uid);
      if (loc) {
        const parts = [loc.title, loc.address].map((p) => p.trim()).filter((p) => p.length > 0);
        location = parts.length > 0 ? parts.join(', ') : null;
      } else {
        warnings.push(MSG_LOCATION_UNKNOWN + row.location_uid);
      }
    }

    // --- tags: column holds tag UIDs; resolve to titles ------------------
    // (falls back to the raw token so title-style exports still work)
    const tags = splitTags(row.tags).map((token) => tagTitleByUid.get(token) ?? token);

    // --- photos: primary first, then by position --------------------------
    const photos: PhotoInput[] = [];
    const attachments = attachmentsByEntry.get(row.uid ?? '') ?? [];
    const sorted = [...attachments].sort((a, b) => {
      const aPrimary = a.uid && a.uid === row.primary_photo_uid ? -1 : 0;
      const bPrimary = b.uid && b.uid === row.primary_photo_uid ? -1 : 0;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      const aPos = Number(a.position ?? 0);
      const bPos = Number(b.position ?? 0);
      return (Number.isFinite(aPos) ? aPos : 0) - (Number.isFinite(bPos) ? bPos : 0);
    });
    let sortOrder = 0;
    for (const att of sorted) {
      const type = att.type ?? '';
      const fileName = att.filename ?? '';
      if (!isImageAttachment(type)) {
        if (fileName) warnings.push(MSG_MEDIA_SKIPPED + `${fileName} (type ${type || 'unknown'})`);
        continue; // videos and other media are skipped, never invented
      }
      const entry = findPhotoEntry(zip, fileName);
      if (!entry) {
        warnings.push(MSG_PHOTO_MISSING + fileName);
        continue;
      }
      const blob = await entry.async('blob');
      photos.push({ fileName, blob, sortOrder: sortOrder++ });
    }

    // --- rating: Diaro has no 1-5 rating ---------------------------------
    // The mood column stores a diaro_moods UID (emoji/preset), which does not
    // map cleanly onto a 1-5 scale, so it is intentionally left null.
    entries.push({
      sourceEntryId: row.uid ?? '',
      eventDate,
      title: row.title ?? '',
      description: row.text ?? '', // preserve newlines exactly as exported
      categoryHint,
      tags,
      location,
      rating: null,
      photos,
    });

    if (totalRows > 0) onProgress?.(40 + Math.round((60 * (i + 1)) / totalRows));
  }

  // Oldest first; stable for equal dates.
  entries.sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));

  onProgress?.(100);
  return { entries, folders, warnings };
}
