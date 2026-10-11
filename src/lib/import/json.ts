/**
 * JSON import parser.
 *
 * Accepts either a top-level array or an object shaped like
 * { "entries": [...] }. Each entry may use any of these field names:
 *   date:        date | event_date
 *   title:       title
 *   description: description | text
 *   category:    category | folder
 *   tags:        tags            (array of strings; a comma/semicolon-separated
 *                                string is also accepted)
 *   location:    location
 *   rating:      rating
 *
 * Unknown fields are ignored. Entries with missing or unparseable dates are
 * skipped with a warning, never invented.
 */

import type { NormalizedEntry, ParsedImport } from './types.js';
import { parseFlexibleDate, parseRating, splitTagCell } from './dates.js';

/* ------------------------------------------------------------------ */
/* Message constants (English; the UI translates before display).      */
/* ------------------------------------------------------------------ */

const MSG_INVALID_JSON = 'File is not valid JSON';
const MSG_BAD_SHAPE = 'JSON must be an array or an object with an "entries" array';
const MSG_BAD_DATE = 'JSON entry skipped, missing or unparseable date: ';

type JsonEntry = Record<string, unknown>;

function firstString(obj: JsonEntry, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

function firstValue(obj: JsonEntry, keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter((t) => t.length > 0);
  }
  if (typeof raw === 'string') return splitTagCell(raw);
  return [];
}

export function parseJson(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(MSG_INVALID_JSON);
  }

  const rawEntries: unknown[] = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { entries?: unknown }).entries)
      ? (data as { entries: unknown[] }).entries
      : [];

  if (!Array.isArray(data) && rawEntries.length === 0) {
    // Distinguish "wrong shape" from "valid but empty".
    const isObj = typeof data === 'object' && data !== null;
    if (!(isObj && 'entries' in (data as object))) {
      throw new Error(MSG_BAD_SHAPE);
    }
  }

  const warnings: string[] = [];
  const entries: NormalizedEntry[] = [];

  rawEntries.forEach((item, i) => {
    if (typeof item !== 'object' || item === null) {
      warnings.push(MSG_BAD_DATE + `index ${i} (not an object)`);
      return;
    }
    const obj = item as JsonEntry;
    const eventDate = parseFlexibleDate(firstValue(obj, ['date', 'event_date']) as string | undefined);
    if (!eventDate) {
      warnings.push(MSG_BAD_DATE + `index ${i}`);
      return;
    }

    const categoryRaw = firstString(obj, ['category', 'folder']);
    const locationRaw = firstString(obj, ['location']);
    const description = firstString(obj, ['description', 'text']);

    entries.push({
      sourceEntryId: `json:${i}`,
      eventDate,
      title: firstString(obj, ['title']) || description.split('\n')[0].trim(),
      description,
      categoryHint: categoryRaw || null,
      tags: normalizeTags(firstValue(obj, ['tags'])),
      location: locationRaw || null,
      rating: parseRating(firstValue(obj, ['rating'])),
      photos: [],
    });
  });

  entries.sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));

  return { entries, folders: [], warnings };
}
