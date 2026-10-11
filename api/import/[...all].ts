import type { VercelRequest, VercelResponse } from '@vercel/node';
import previewHandler from '../../server/handlers/import-preview.js';
import jobsIndexHandler from '../../server/handlers/import-jobs-index.js';
import jobsIdHandler from '../../server/handlers/import-jobs-id.js';
import batchHandler from '../../server/handlers/import-jobs-id-batch.js';
import completeHandler from '../../server/handlers/import-jobs-id-complete.js';
import { err } from '../../server/lib/respond.js';

/** Catch-all router for the whole import pipeline:
 *  POST /api/import/preview, POST /api/import/jobs,
 *  GET /api/import/jobs/:id, POST /api/import/jobs/:id/batch,
 *  POST /api/import/jobs/:id/complete. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const all = req.query.all;
  const segs = (Array.isArray(all) ? all : all ? [all] : []).filter(Boolean);
  const [first, second, third] = segs;
  if (first === 'preview' && segs.length === 1) return previewHandler(req, res);
  if (first === 'jobs' && segs.length === 1) return jobsIndexHandler(req, res);
  if (first === 'jobs' && second && segs.length === 2) {
    (req.query as Record<string, string>).id = second;
    return jobsIdHandler(req, res);
  }
  if (first === 'jobs' && second && third === 'batch' && segs.length === 3) {
    (req.query as Record<string, string>).id = second;
    return batchHandler(req, res);
  }
  if (first === 'jobs' && second && third === 'complete' && segs.length === 3) {
    (req.query as Record<string, string>).id = second;
    return completeHandler(req, res);
  }
  return err(res, 404, 'not_found', 'Not found');
}
