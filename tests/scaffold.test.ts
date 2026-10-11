/**
 * MyLife Journal — scaffold smoke tests.
 *
 * Verifies the shared libs (browser-safe validate.ts + node-only auth.ts)
 * load and behave correctly under vitest, so later waves have a known-good
 * test pattern to follow.
 */
import { describe, it, expect } from 'vitest';
import { dateStringSchema, entryInputSchema, loginSchema } from '../api/_lib/validate.js';
import { signSession, verifySession } from '../api/_lib/auth.js';

describe('dateStringSchema', () => {
  it('accepts a normal calendar date', () => {
    expect(dateStringSchema.safeParse('2026-10-11').success).toBe(true);
  });
  it('accepts leap day 2024-02-29', () => {
    expect(dateStringSchema.safeParse('2024-02-29').success).toBe(true);
  });
  it('rejects non-leap 2023-02-29', () => {
    expect(dateStringSchema.safeParse('2023-02-29').success).toBe(false);
  });
  it('rejects malformed strings', () => {
    expect(dateStringSchema.safeParse('11/10/2026').success).toBe(false);
    expect(dateStringSchema.safeParse('2026-13-01').success).toBe(false);
  });
});

describe('entryInputSchema', () => {
  it('rejects rating 6 and empty title', () => {
    const base = {
      event_date: '2026-10-11',
      title: 'x',
      category_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    };
    expect(entryInputSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...base, rating: 6 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...base, rating: 5 }).success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ password: 'secret' }).success).toBe(true);
  });
});

describe('session tokens', () => {
  const secret = 'scaffold-test-secret';
  it('round-trips sign -> verify', () => {
    const token = signSession(secret);
    expect(verifySession(token, secret)).toBe(true);
  });
  it('rejects tampered tokens and wrong secrets', () => {
    const token = signSession(secret);
    expect(verifySession(token + 'x', secret)).toBe(false);
    expect(verifySession(token, 'other-secret')).toBe(false);
  });
});
