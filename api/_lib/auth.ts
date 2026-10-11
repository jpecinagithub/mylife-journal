/**
 * MyLife Journal — HMAC-SHA256 session auth (node-only).
 *
 * Single-owner app: one OWNER_PASSWORD_HASH env var, one session cookie.
 */
import crypto from 'node:crypto';
import { stringifySetCookie, parseCookie } from 'cookie';
import bcrypt from 'bcryptjs';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { err } from './respond.js';

export const SESSION_COOKIE_NAME = 'mylife_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/**
 * Sign a fresh session token. Payload: { v: 1, exp: <seconds epoch> }.
 * Token format: base64url(payload) + '.' + base64url(HMAC-SHA256(secret, payloadB64))
 */
export function signSession(secret: string): string {
  const payload = JSON.stringify({
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });
  const payloadB64 = base64url(payload);
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

/** Verify a session token: correct HMAC, valid shape, not expired. */
export function verifySession(token: string, secret: string): boolean {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return false;
    const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest();
    const actual = base64urlDecode(sigB64);
    if (actual.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(actual, expected)) return false;
    const payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as {
      v?: number;
      exp?: number;
    };
    if (payload.v !== 1 || typeof payload.exp !== 'number') return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Serialize the session cookie for Set-Cookie. Secure only in prod/Vercel. */
export function serializeSessionCookie(token: string): string {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  return stringifySetCookie({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Serialize an expired cookie to clear the session. */
export function clearSessionCookie(): string {
  return stringifySetCookie({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is required');
  return secret;
}

/** Verify an owner password against OWNER_PASSWORD_HASH. */
export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.OWNER_PASSWORD_HASH;
  if (!hash) throw new Error('OWNER_PASSWORD_HASH env var is required');
  return bcrypt.compare(password, hash);
}

/**
 * Guard for authenticated routes. Reads the session cookie, verifies it,
 * sends 401 and returns false when invalid; returns true when valid.
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const cookies = parseCookie(req.headers.cookie ?? '');
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token || !verifySession(token, getSecret())) {
    err(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return false;
  }
  return true;
}

/**
 * Simple CSRF guard for state-changing methods.
 *
 * If the request carries an Origin header, its origin must match the request
 * host's origin. Otherwise, if a Referer header is present, its origin must
 * match. If neither is present (non-browser clients, curl, mobile), allow.
 *
 * Sends 403 and returns false on mismatch.
 */
export function checkCsrf(req: VercelRequest, res: VercelResponse): boolean {
  const method = (req.method ?? 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;

  const host = req.headers.host;
  if (!host) {
    err(res, 403, 'CSRF_FAILED', 'Cannot determine request host');
    return false;
  }
  // Assume https on Vercel; http only in local dev
  const requestOrigin = `${process.env.VERCEL || process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}`;

  const origin = req.headers.origin;
  if (origin) {
    if (origin !== requestOrigin) {
      err(res, 403, 'CSRF_FAILED', 'Origin mismatch');
      return false;
    }
    return true;
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (refererOrigin !== requestOrigin) {
        err(res, 403, 'CSRF_FAILED', 'Referer mismatch');
        return false;
      }
    } catch {
      err(res, 403, 'CSRF_FAILED', 'Invalid Referer header');
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Login rate limiting
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateBucket>();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * NOTE: in-memory per-instance rate limiter. On Vercel, serverless functions
 * scale to multiple instances, so a distributed attacker can get 5 attempts
 * per instance per window. This is a pragmatic baseline; a DB-backed limiter
 * (e.g. a table keyed by IP with sliding-window counts) is a future
 * improvement if brute-force becomes a concern.
 */
export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = loginAttempts.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}
