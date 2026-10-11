import type { VercelRequest, VercelResponse } from '@vercel/node';
import loginHandler from '../../server/handlers/auth-login.js';
import logoutHandler from '../../server/handlers/auth-logout.js';
import meHandler from '../../server/handlers/auth-me.js';
import { err } from '../../server/lib/respond.js';

/** Catch-all router: /api/auth/{login,logout,me}. Single function to stay
 *  within the Vercel Hobby 12-function limit. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const all = req.query.all;
  const segs = Array.isArray(all) ? all : all ? [all] : [];
  const [action] = segs;
  if (action === 'login' && segs.length === 1) return loginHandler(req, res);
  if (action === 'logout' && segs.length === 1) return logoutHandler(req, res);
  if (action === 'me' && segs.length === 1) return meHandler(req, res);
  return err(res, 404, 'not_found', 'Not found');
}
