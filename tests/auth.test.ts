/**
 * MyLife Journal — session auth contract tests (api/_lib/auth.ts).
 *
 * signSession/verifySession take the secret as an argument; SESSION_SECRET is
 * set here as well so the env-based helpers (requireAuth, verifyPassword)
 * resolve the same secret if exercised later.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { signSession, verifySession } from '../api/_lib/auth.js';

const SECRET = 'test-session-secret-do-not-use-in-prod';

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});

/** Forge a token with the same wire format but a chosen exp (for expiry tests). */
function forgeToken(secret: string, exp: number): string {
  const payloadB64 = Buffer.from(JSON.stringify({ v: 1, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest().toString('base64url');
  return `${payloadB64}.${sig}`;
}

describe('session sign/verify round-trip', () => {
  it('verifies a freshly signed token', () => {
    const token = signSession(SECRET);
    expect(verifySession(token, SECRET)).toBe(true);
  });

  it('rejects a tampered token (flipped char in payload)', () => {
    const token = signSession(SECRET);
    const [payload, sig] = token.split('.');
    const flipped = (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1);
    expect(verifySession(`${flipped}.${sig}`, SECRET)).toBe(false);
  });

  it('rejects a tampered token (flipped char in signature)', () => {
    const token = signSession(SECRET);
    const [payload, sig] = token.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifySession(`${payload}.${flipped}`, SECRET)).toBe(false);
  });

  it('rejects an expired token (exp in the past)', () => {
    const expired = forgeToken(SECRET, Math.floor(Date.now() / 1000) - 60);
    expect(verifySession(expired, SECRET)).toBe(false);
  });

  it('accepts a token with exp in the future', () => {
    const fresh = forgeToken(SECRET, Math.floor(Date.now() / 1000) + 3600);
    expect(verifySession(fresh, SECRET)).toBe(true);
  });

  it('rejects with the wrong secret', () => {
    const token = signSession(SECRET);
    expect(verifySession(token, 'a-different-secret')).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(verifySession('', SECRET)).toBe(false);
    expect(verifySession('no-dot-here', SECRET)).toBe(false);
    expect(verifySession('a.b.c', SECRET)).toBe(false);
  });
});
