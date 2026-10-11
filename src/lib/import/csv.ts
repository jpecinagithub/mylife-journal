/**
 * Flexible CSV parser for journal imports.
 *
 * Expected first row is a header. Recognized column names (case-insensitive,
 * accents kept, trimmed):
 *   date:        date | fecha
 *   title:       title | titulo
 *   description: description | descripcion | texto
 *   category:    category | categoria | folder
 *   tags:        tags | etiquetas            (comma/semicolon separated)
 *   location:    location | ubicacion
 *   rating:      rating | valoracion
 *
 * A `date` column is required. Dates are parsed with parseFlexibleDate
 * (YYYY-MM-DD, then DD/MM/YYYY, then MM/DD/YYYY); rows with unparseable
 * dates are skipped with a warning, never invented.
 * Entries without an explicit title fall back to the first line of the
 * description (documented behavior; titles are never invented from nothing).
 */

import type { NormalizedEntry, ParsedImport } from './types.js';
import { parseFlexibleDate, parseRating, splitTagCell } from './dates.js';

/* ------------------------------------------------------------------ */
/* Message constants (English; the UI translates before display).      */
/* ------------------------------------------------------------------ */

const MSG_NO_DATE_COLUMN = 'CSV has no recognizable date column (expected date|fecha)';
const MSG_BAD_DATE = 'CSV row skipped, unparseable date: ';
const MSG_TITLE_FALLBACK = 'CSV rows used the first description line as title: ';

/* ------------------------------------------------------------------ */
/* Minimal RFC-4180-ish CSV reader                                     */
/* ------------------------------------------------------------------ */

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r') {
      i++;
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
    } else {
      field += c;
      i++;
    }
  }
  // Trailing field / unterminated quote still yields a row.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Header mapping                                                       */
/* ------------------------------------------------------------------ */

const HEADER_ALIASES: Record<string, string> = {
  date: 'date',
  fecha: 'date',
  title: 'title',
  titulo: 'title',
  'título': 'title',
  description: 'description',
  descripcion: 'description',
  'descripción': 'description',
  texto: 'description',
  text: 'description',
  category: 'category',
  categoria: 'category',
  'categoría': 'category',
  folder: 'category',
  tags: 'tags',
  etiquetas: 'tags',
  location: 'location',
  ubicacion: 'location',
  'ubicación': 'location',
  rating: 'rating',
  valoracion: 'rating',
  'valoración': 'rating',
};

function mapHeaders(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const key = HEADER_ALIASES[h.trim().toLowerCase()];
    if (key && !(key in map)) map[key] = idx; // first occurrence wins
  });
  return map;
}

/* ------------------------------------------------------------------ */
/* Main parser                                                          */
/* ------------------------------------------------------------------ */

export function parseCsv(text: string): ParsedImport {
  const rows = parseCsvRows(text);
  const warnings: string[] = [];
  if (rows.length === 0) return { entries: [], folders: [], warnings };

  const columns = mapHeaders(rows[0]);
  if (!('date' in columns)) {
    throw new Error(MSG_NO_DATE_COLUMN);
  }

  const entries: NormalizedEntry[] = [];
  let titleFallbacks = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((cell) => cell.trim() === '')) continue; // skip blank rows

    const cell = (key: string): string => (key in columns ? (row[columns[key]] ?? '').trim() : '');

    const eventDate = parseFlexibleDate(cell('date'));
    if (!eventDate) {
      warnings.push(MSG_BAD_DATE + `row ${r + 1}: "${cell('date')}"`);
      continue;
    }

    const description = cell('description');
    let title = cell('title');
    if (!title && description) {
      title = description.split('\n')[0].trim();
      titleFallbacks++;
    }

    const categoryRaw = cell('category');
    const locationRaw = cell('location');

    entries.push({
      sourceEntryId: `csv:${r}`,
      eventDate,
      title,
      description,
      categoryHint: categoryRaw || null,
      tags: splitTagCell(cell('tags')),
      location: locationRaw || null,
      rating: parseRating(cell('rating') || null),
      photos: [],
    });
  }

  if (titleFallbacks > 0) {
    warnings.push(MSG_TITLE_FALLBACK + String(titleFallbacks));
  }

  // Oldest first; stable for equal dates.
  entries.sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));

  return { entries, folders: [], warnings };
}
