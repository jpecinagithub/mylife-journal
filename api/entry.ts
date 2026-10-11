import type { VercelRequest, VercelResponse } from '@vercel/node';
import idHandler from '../server/handlers/entries-id.js';

/** Flat router (via vercel.json rewrite /api/entries/:id -> /api/entry?id=:id).
 *  The collection routes (GET/POST /api/entries) live in api/entries.ts.
 *  The moved handler reads the id via queryParam(req, 'id'). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return idHandler(req, res);
}
