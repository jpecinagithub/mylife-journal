import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { checkCsrf, requireAuth } from '../lib/auth.js';
import { getDb, importJobs, importItems } from '../lib/db.js';
import { err, ok, methodNotAllowed } from '../lib/respond.js';
import { queryParam } from '../lib/entry-dto.js';

const idSchema = z.string().uuid();

/**
 * POST /api/import/jobs/[id]/complete — mark the job completed and return
 * the final report. Failed items (with their error messages, max 100) are
 * included so the client can show or retry them.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!checkCsrf(req, res)) return;
  if (!requireAuth(req, res)) return;

  const id = queryParam(req, 'id');
  if (!id || !idSchema.safeParse(id).success) {
    return err(res, 400, 'bad_request', 'Invalid job id');
  }

  try {
    const db = getDb();
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    if (!job) return err(res, 404, 'not_found', 'Import job not found');

    const failedItems = await db
      .select({
        source_entry_id: importItems.sourceEntryId,
        error_message: importItems.errorMessage,
      })
      .from(importItems)
      .where(and(eq(importItems.importJobId, id), eq(importItems.status, 'failed')))
      .orderBy(asc(importItems.createdAt))
      .limit(100);

    await db
      .update(importJobs)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(importJobs.id, id));

    return ok(res, {
      report: {
        total: job.totalItems ?? 0,
        imported: job.importedItems ?? 0,
        duplicates: job.duplicateItems ?? 0,
        failed: job.failedItems ?? 0,
        errors: failedItems,
      },
    });
  } catch (e) {
    console.error('POST /api/import/jobs/[id]/complete failed', e);
    return err(res, 500, 'server_error', 'Failed to complete import job');
  }
}
