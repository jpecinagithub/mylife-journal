import type { VercelRequest, VercelResponse } from '@vercel/node';
import loginHandler from '../server/handlers/auth-login.js';
import logoutHandler from '../server/handlers/auth-logout.js';
import meHandler from '../server/handlers/auth-me.js';
import { err } from '../server/lib/respond.js';
import { queryParam } from '../server/lib/entry-dto.js';

/** Flat router (via vercel.json rewrite /api/auth/:action -> /api/auth-action?action=:action):
 *  login, logout, me. Single function to stay within the Vercel Hobby 12-function limit. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = queryParam(req, 'action');
  if (action === 'login') return loginHandler(req, res);
  if (action === 'logout') return logoutHandler(req, res);
  if (action === 'me') return meHandler(req, res);
  return err(res, 404, 'not_found', 'Not found');
}
