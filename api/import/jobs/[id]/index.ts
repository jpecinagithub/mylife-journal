import type { VercelRequest, VercelResponse } from '@vercel/node';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '../../../_lib/auth.js';
import { getDb, importJobs, importItems } from '../../../_lib/db.js';
import { err, ok, methodNotAllowed } from '../../../_lib/respond.js';
import { queryParam, toImportJobDTO } from '../../../_lib/entry-dto.js';

const idSchema = z.string().uuid();

/**
 * GET /api/import/jobs/[id] — job detail plus its items (cap 5000).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;

  const id = queryParam(req, 'id');
  if (!id || !idSchema.safeParse(id).success) {
    return err(res, 400, 'bad_request', 'Invalid job id');
  }

  try {
    const db = getDb();
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    if (!job) return err(res, 404, 'not_found', 'Import job not found');

    const items = await db
      .select({
        source_entry_id: importItems.sourceEntryId,
        status: importItems.status,
        error_message: importItems.errorMessage,
      })
      .from(importItems)
      .where(eq(importItems.importJobId, id))
      .orderBy(asc(importItems.createdAt))
      .limit(5000);

    return ok(res, { job: toImportJobDTO(job), items });
  } catch (e) {
    console.error('GET /api/import/jobs/[id] failed', e);
    return err(res, 500, 'server_error', 'Failed to fetch import job');
  }
}
