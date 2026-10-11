import type { VercelRequest, VercelResponse } from '@vercel/node';
import idHandler from '../../server/handlers/entries-id.js';
import { err } from '../../server/lib/respond.js';

/** Catch-all router: /api/entries/:id (GET/PATCH/DELETE). The collection
 *  routes (GET/POST /api/entries) live in api/entries.ts. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const all = req.query.all;
  const segs = Array.isArray(all) ? all : all ? [all] : [];
  const [id] = segs;
  if (!id || segs.length !== 1) return err(res, 404, 'not_found', 'Not found');
  (req.query as Record<string, string>).id = id;
  return idHandler(req, res);
}
