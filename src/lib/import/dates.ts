/**
 * Shared date helpers for the text-based import parsers (CSV/JSON/TXT).
 *
 * Date acceptance order (documented for the UI):
 *   1. YYYY-MM-DD (optionally followed by a time part, which is ignored)
 *   2. DD/MM/YYYY (day-first, per European convention)
 *   3. MM/DD/YYYY (only reached when DD/MM/YYYY is invalid, e.g. month > 12)
 *
 * Every accepted date is validated as a real calendar date and returned as
 * 'YYYY-MM-DD'. Returns null when the value cannot be parsed.
 */

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/;
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s.*)?$/;

function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeYear(y: number): number {
  // Two-digit years: 00-29 -> 2000s, 30-99 -> 1900s (common spreadsheet rule).
  if (y < 100) return y <= 29 ? 2000 + y : 1900 + y;
  return y;
}

export function parseFlexibleDate(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = ISO_RE.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (isValidDate(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
    return null;
  }

  m = DMY_RE.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = normalizeYear(Number(m[3]));
    // Try DD/MM/YYYY first...
    if (isValidDate(y, b, a)) return `${y}-${pad2(b)}-${pad2(a)}`;
    // ...then fall back to MM/DD/YYYY.
    if (isValidDate(y, a, b)) return `${y}-${pad2(a)}-${pad2(b)}`;
    return null;
  }

  return null;
}

/** Coerce a rating value to the 1-5 range; null when out of range or missing. */
export function parseRating(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

/** Split a tag cell on commas or semicolons. */
export function splitTagCell(raw: string | undefined | null): string[] {
  if (raw == null) return [];
  return String(raw)
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
