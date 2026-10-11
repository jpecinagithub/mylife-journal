import type { VercelRequest, VercelResponse } from '@vercel/node';
import uploadHandler from '../../server/handlers/images-upload.js';
import idHandler from '../../server/handlers/images-id.js';
import { err } from '../../server/lib/respond.js';

/** Catch-all router: POST /api/images/upload, DELETE /api/images/:id. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const all = req.query.all;
  const segs = Array.isArray(all) ? all : all ? [all] : [];
  const [first] = segs;
  if (first === 'upload' && segs.length === 1) return uploadHandler(req, res);
  if (first && segs.length === 1) {
    (req.query as Record<string, string>).id = first;
    return idHandler(req, res);
  }
  return err(res, 404, 'not_found', 'Not found');
}
