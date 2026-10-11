import type { VercelRequest, VercelResponse } from '@vercel/node';
import csvHandler from '../server/handlers/export-csv.js';
import jsonHandler from '../server/handlers/export-json.js';
import { err } from '../server/lib/respond.js';
import { queryParam } from '../server/lib/entry-dto.js';

/** Flat router (via vercel.json rewrite /api/export/:format -> /api/export-router?format=:format). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const format = queryParam(req, 'format');
  if (format === 'csv') return csvHandler(req, res);
  if (format === 'json') return jsonHandler(req, res);
  return err(res, 404, 'not_found', 'Not found');
}
