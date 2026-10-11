/**
 * MyLife Journal — zod schema contract tests (server/lib/validate.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  dateStringSchema,
  entryInputSchema,
  calendarQuerySchema,
  loginSchema,
  importBatchSchema,
} from '../server/lib/validate.js';

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function validEntry() {
  return {
    event_date: '2026-10-11',
    title: 'A walk in Testville',
    category_id: UUID,
  };
}

describe('dateStringSchema', () => {
  it('accepts a normal date', () => {
    expect(dateStringSchema.safeParse('2026-10-11').success).toBe(true);
  });
  it('accepts leap day 2024-02-29', () => {
    expect(dateStringSchema.safeParse('2024-02-29').success).toBe(true);
  });
  it('rejects impossible date 2026-02-30', () => {
    expect(dateStringSchema.safeParse('2026-02-30').success).toBe(false);
  });
  it('rejects 2023-02-29 (not a leap year)', () => {
    expect(dateStringSchema.safeParse('2023-02-29').success).toBe(false);
  });
  it('rejects malformed shapes', () => {
    for (const bad of ['11/10/2026', '2026-1-1', '2026-13-01', '2026-00-10', '', 'not-a-date']) {
      expect(dateStringSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('entryInputSchema', () => {
  it('accepts a minimal valid entry', () => {
    const res = entryInputSchema.safeParse(validEntry());
    expect(res.success).toBe(true);
  });
  it('accepts a full entry with rating, tags and photos', () => {
    const res = entryInputSchema.safeParse({
      ...validEntry(),
      description: 'Details here',
      rating: 5,
      location: 'Testville',
      tags: ['walks', 'autumn'],
      photos: [{ pathname: 'photos/a.jpg', sortOrder: 0 }],
    });
    expect(res.success).toBe(true);
  });
  it('rejects bad date 2026-02-30', () => {
    expect(entryInputSchema.safeParse({ ...validEntry(), event_date: '2026-02-30' }).success).toBe(
      false,
    );
  });
  it('accepts leap date 2024-02-29', () => {
    expect(entryInputSchema.safeParse({ ...validEntry(), event_date: '2024-02-29' }).success).toBe(
      true,
    );
  });
  it('rejects rating 0 and 6, accepts 1 and 5', () => {
    expect(entryInputSchema.safeParse({ ...validEntry(), rating: 0 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...validEntry(), rating: 6 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...validEntry(), rating: 1 }).success).toBe(true);
    expect(entryInputSchema.safeParse({ ...validEntry(), rating: 5 }).success).toBe(true);
    expect(entryInputSchema.safeParse({ ...validEntry(), rating: null }).success).toBe(true);
  });
  it('rejects empty title', () => {
    expect(entryInputSchema.safeParse({ ...validEntry(), title: '' }).success).toBe(false);
  });
  it('rejects non-uuid category_id', () => {
    expect(entryInputSchema.safeParse({ ...validEntry(), category_id: 'nope' }).success).toBe(
      false,
    );
  });
});

describe('calendarQuerySchema', () => {
  it('accepts a valid year/month', () => {
    expect(calendarQuerySchema.safeParse({ year: 2026, month: 10 }).success).toBe(true);
  });
  it('rejects month 13 (and month 0)', () => {
    expect(calendarQuerySchema.safeParse({ year: 2026, month: 13 }).success).toBe(false);
    expect(calendarQuerySchema.safeParse({ year: 2026, month: 0 }).success).toBe(false);
  });
  it('coerces numeric strings', () => {
    const res = calendarQuerySchema.safeParse({ year: '2026', month: '10' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual({ year: 2026, month: 10 });
  });
});

describe('loginSchema', () => {
  it('rejects empty password', () => {
    expect(loginSchema.safeParse({ password: '' }).success).toBe(false);
  });
  it('rejects missing password', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
  it('accepts a non-empty password', () => {
    expect(loginSchema.safeParse({ password: 'correct-horse' }).success).toBe(true);
  });
});

describe('importBatchSchema', () => {
  const item = (i: number) => ({
    source_entry_id: `src-${i}`,
    event_date: '2026-10-11',
    title: `Entry ${i}`,
  });

  it('accepts exactly 100 items (schema max as-is)', () => {
    const items = Array.from({ length: 100 }, (_, i) => item(i));
    expect(importBatchSchema.safeParse({ jobId: UUID, items }).success).toBe(true);
  });
  it('rejects 101 items', () => {
    const items = Array.from({ length: 101 }, (_, i) => item(i));
    expect(importBatchSchema.safeParse({ jobId: UUID, items }).success).toBe(false);
  });
  it('rejects an empty items array', () => {
    expect(importBatchSchema.safeParse({ jobId: UUID, items: [] }).success).toBe(false);
  });
  it('rejects a non-uuid jobId', () => {
    expect(importBatchSchema.safeParse({ jobId: 'nope', items: [item(0)] }).success).toBe(false);
  });
});
