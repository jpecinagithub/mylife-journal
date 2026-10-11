import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import {
  checkCsrf,
  checkLoginRateLimit,
  serializeSessionCookie,
  signSession,
} from '../lib/auth.js';
import { loginSchema } from '../lib/validate.js';
import { err, ok, methodNotAllowed } from '../lib/respond.js';

function clientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const first = typeof xff === 'string' ? xff.split(',')[0].trim() : '';
  return first || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!checkCsrf(req, res)) return;

  const rl = checkLoginRateLimit(clientIp(req));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return err(res, 429, 'rate_limited', 'Too many login attempts. Try again later.');
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body');
  }

  const hash = process.env.OWNER_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;
  if (!hash || !secret) {
    // Never leak which env var is missing.
    return err(res, 500, 'misconfigured', 'Server is not configured for authentication');
  }

  let valid = false;
  try {
    valid = await bcrypt.compare(parsed.data.password, hash);
  } catch {
    valid = false;
  }
  if (!valid) {
    // Generic message: do not reveal whether the failure was a bad password.
    return err(res, 401, 'unauthorized', 'Invalid credentials');
  }

  res.setHeader('Set-Cookie', serializeSessionCookie(signSession(secret)));
  return ok(res, { ok: true });
}
