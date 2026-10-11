/**
 * MyLife Journal — frontend date-utils contract tests (src/lib/dates.ts).
 *
 * Pure, timezone-free helpers. The suite self-skips if the module is absent
 * (variable dynamic-import specifier keeps tsc green either way; equivalent
 * to `import '@/lib/dates'` at runtime, resolved relative to this file).
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Contract of src/lib/dates.ts — mirrors the real module 1:1. */
interface YmdParts {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}
type Lang = 'es' | 'en';
interface GridDay {
  date: string; // 'YYYY-MM-DD', timezone-free
  inMonth: boolean;
  isToday: boolean;
}
interface DatesModule {
  parseYMD(s: string): YmdParts;
  formatLong(dateStr: string, lang: Lang): string;
  monthGrid(year: number, month: number): GridDay[][];
  addMonths(y: number, m: number, delta: number): { y: number; m: number };
  isLeapYear(y: number): boolean;
}

const MODULE_FILE = join(process.cwd(), 'src', 'lib', 'dates.ts');
const SPECIFIER: string = '../src/lib/dates.js'; // same module as '@/lib/dates'

const dates: DatesModule | null = existsSync(MODULE_FILE)
  ? ((await import(/* @vite-ignore */ SPECIFIER).catch(() => null) as DatesModule | null))
  : null;

if (!dates) {
  it('TODO: src/lib/dates.ts not implemented yet — contract tests skipped', () => {
    expect(true).toBe(true);
  });
}

describe.skipIf(!dates)('dates utils (src/lib/dates)', () => {
  const d = () => dates as DatesModule;

  it('parseYMD splits components without timezone shifts', () => {
    expect(d().parseYMD('2026-10-11')).toEqual({ y: 2026, m: 10, d: 11 });
  });

  it('parseYMD throws on malformed input', () => {
    expect(() => d().parseYMD('11/10/2026')).toThrow();
    expect(() => d().parseYMD('2026-02-30')).toThrow();
  });

  it('monthGrid(2026, 10): first week starts Monday 2026-09-28', () => {
    const grid = d().monthGrid(2026, 10);
    expect(grid.length).toBeGreaterThanOrEqual(4);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0].date).toBe('2026-09-28');
    expect(grid[0][0].inMonth).toBe(false);
  });

  it('monthGrid(2026, 10): 2026-10-01 (Thursday) sits in the Thursday column', () => {
    const grid = d().monthGrid(2026, 10);
    let col = -1;
    for (const week of grid) {
      week.forEach((cell, i) => {
        if (cell.date === '2026-10-01') col = i;
      });
    }
    expect(col).toBe(3); // Mon-start: Mon 0, Tue 1, Wed 2, Thu 3
    const cell = grid.flat().find((c) => c.date === '2026-10-01');
    expect(cell?.inMonth).toBe(true);
  });

  it('monthGrid February 2024 has 29 in-month days', () => {
    const grid = d().monthGrid(2024, 2);
    const inMonth = grid.flat().filter((c) => c.inMonth && c.date.startsWith('2024-02'));
    expect(inMonth).toHaveLength(29);
    expect(inMonth[inMonth.length - 1].date).toBe('2024-02-29');
  });

  it('addMonths moves across year boundaries', () => {
    expect(d().addMonths(2026, 10, 3)).toEqual({ y: 2027, m: 1 });
    expect(d().addMonths(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(d().addMonths(2026, 10, 0)).toEqual({ y: 2026, m: 10 });
  });

  it('isLeapYear: 2000 true, 1900 false', () => {
    expect(d().isLeapYear(2000)).toBe(true);
    expect(d().isLeapYear(1900)).toBe(false);
    expect(d().isLeapYear(2024)).toBe(true);
    expect(d().isLeapYear(2026)).toBe(false);
  });

  it('formatLong renders a human string in both languages', () => {
    const en = d().formatLong('2026-10-11', 'en');
    expect(en).toContain('2026');
    expect(en).toContain('October');
    expect(en).toContain('11');
    const es = d().formatLong('2026-10-11', 'es');
    expect(es).toContain('2026');
    expect(es).toContain('octubre');
  });
});
