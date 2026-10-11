import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkCsrf, requireAuth, clearSessionCookie } from '../_lib/auth.js';
import { ok, methodNotAllowed } from '../_lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!checkCsrf(req, res)) return;
  if (!requireAuth(req, res)) return;

  res.setHeader('Set-Cookie', clearSessionCookie());
  return ok(res, { ok: true });
}
