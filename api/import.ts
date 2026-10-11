import type { VercelRequest, VercelResponse } from '@vercel/node';
import previewHandler from '../server/handlers/import-preview.js';
import jobsIndexHandler from '../server/handlers/import-jobs-index.js';
import jobsIdHandler from '../server/handlers/import-jobs-id.js';
import batchHandler from '../server/handlers/import-jobs-id-batch.js';
import completeHandler from '../server/handlers/import-jobs-id-complete.js';
import { err } from '../server/lib/respond.js';
import { queryParam } from '../server/lib/entry-dto.js';

/** Flat router for the whole import pipeline. Rewrites:
 *  POST /api/import/preview          -> /api/import?action=preview
 *  POST /api/import/jobs             -> /api/import?action=jobs
 *  GET  /api/import/jobs/:id         -> /api/import?action=job&id=:id
 *  POST /api/import/jobs/:id/batch   -> /api/import?action=batch&id=:id
 *  POST /api/import/jobs/:id/complete-> /api/import?action=complete&id=:id */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = queryParam(req, 'action');
  if (action === 'preview') return previewHandler(req, res);
  if (action === 'jobs') return jobsIndexHandler(req, res);
  if (action === 'job') return jobsIdHandler(req, res);
  if (action === 'batch') return batchHandler(req, res);
  if (action === 'complete') return completeHandler(req, res);
  return err(res, 404, 'not_found', 'Not found');
}
