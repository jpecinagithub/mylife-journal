/**
 * MyLife Journal — date helpers treating 'YYYY-MM-DD' as timezone-free.
 *
 * Never `new Date('YYYY-MM-DD')` (parses as UTC midnight and shifts days in
 * negative-offset timezones). All helpers split the string into y/m/d parts
 * and only use Date.UTC for locale formatting, never for date math.
 */

export interface YmdParts {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export type Lang = 'es' | 'en';

/** Split 'YYYY-MM-DD' into parts. Throws on malformed input. */
export function parseYMD(s: string): YmdParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid YYYY-MM-DD date: ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new Error(`Invalid calendar date: ${s}`);
  }
  return { y, m: mo, d };
}

export function toYMD(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Local "today" as YYYY-MM-DD (local timezone calendar day). */
export function todayYMD(now = new Date()): string {
  return toYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = (y * 12 + (m - 1) + delta) % 12;
  const norm = ((total % 12) + 12) % 12;
  return { y: y + Math.floor((m - 1 + delta) / 12), m: norm + 1 };
}

/** Compare two YYYY-MM-DD strings: -1 | 0 | 1 (string compare works for this format). */
export function compareYMD(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayYMD();
}

/**
 * Weekday index where 0 = Monday … 6 = Sunday.
 * Zeller-free: derive from the local Date of y/m/d (calendar math only).
 */
export function weekdayIndex(y: number, m: number, d: number): number {
  // 1970-01-01 was a Thursday (index 3). Count days since then.
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return (((days + 3) % 7) + 7) % 7;
}

export interface GridDay {
  date: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
}

/**
 * Month grid as rows of 7 cells starting MONDAY.
 * Includes leading/trailing days from adjacent months to fill whole weeks.
 */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = weekdayIndex(year, month, 1); // 0 = Monday
  const dim = daysInMonth(year, month);
  const prev = addMonths(year, month, -1);
  const dimPrev = daysInMonth(prev.y, prev.m);
  const next = addMonths(year, month, 1);
  const today = todayYMD();

  const cells: GridDay[] = [];
  for (let i = first - 1; i >= 0; i--) {
    const d = dimPrev - i;
    const date = toYMD(prev.y, prev.m, d);
    cells.push({ date, inMonth: false, isToday: date === today });
  }
  for (let d = 1; d <= dim; d++) {
    const date = toYMD(year, month, d);
    cells.push({ date, inMonth: true, isToday: date === today });
  }
  let d = 1;
  while (cells.length % 7 !== 0) {
    const date = toYMD(next.y, next.m, d++);
    cells.push({ date, inMonth: false, isToday: date === today });
  }
  const weeks: GridDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** '2026-10-11' → 'domingo, 11 de octubre de 2026' / 'Sunday, October 11, 2026'. */
export function formatLong(dateStr: string, lang: Lang): string {
  const { y, m, d } = parseYMD(dateStr);
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** '2026-10-11' → '11 oct 2026' / 'Oct 11, 2026'. */
export function formatShort(dateStr: string, lang: Lang): string {
  const { y, m, d } = parseYMD(dateStr);
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** (2026, 10) → 'octubre de 2026' / 'October 2026'. */
export function formatMonthYear(y: number, m: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export const WEEKDAY_LABELS: Record<Lang, string[]> = {
  es: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** 'hoy'/'ayer'/'tomorrow' etc., null when the date isn't close to today. */
export function relativeDay(dateStr: string, lang: Lang): string | null {
  const today = todayYMD();
  if (dateStr === today) return lang === 'es' ? 'Hoy' : 'Today';
  const { y, m, d } = parseYMD(today);
  const base = Date.UTC(y, m - 1, d);
  const p = parseYMD(dateStr);
  const diff = Math.round((Date.UTC(p.y, p.m - 1, p.d) - base) / 86_400_000);
  if (diff === -1) return lang === 'es' ? 'Ayer' : 'Yesterday';
  if (diff === 1) return lang === 'es' ? 'Mañana' : 'Tomorrow';
  return null;
}
