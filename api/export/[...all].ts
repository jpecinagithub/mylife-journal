import type { VercelRequest, VercelResponse } from '@vercel/node';
import csvHandler from '../../server/handlers/export-csv.js';
import jsonHandler from '../../server/handlers/export-json.js';
import { err } from '../../server/lib/respond.js';

/** Catch-all router: /api/export/{csv,json}. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const all = req.query.all;
  const segs = Array.isArray(all) ? all : all ? [all] : [];
  const [format] = segs;
  if (format === 'csv' && segs.length === 1) return csvHandler(req, res);
  if (format === 'json' && segs.length === 1) return jsonHandler(req, res);
  return err(res, 404, 'not_found', 'Not found');
}
