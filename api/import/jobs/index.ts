import type { VercelRequest, VercelResponse } from '@vercel/node';
import { desc } from 'drizzle-orm';
import { checkCsrf, requireAuth } from '../../_lib/auth.js';
import { getDb, importJobs } from '../../_lib/db.js';
import { importJobCreateSchema } from '../../_lib/validate.js';
import { err, ok, methodNotAllowed } from '../../_lib/respond.js';
import { toImportJobDTO, type Db } from '../../_lib/entry-dto.js';

async function handleCreate(req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = importJobCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const b = parsed.data;
  const [job] = await db
    .insert(importJobs)
    .values({
      source: b.source,
      status: 'pending',
      fileName: b.fileName ?? null,
      totalItems: b.totalItems,
    })
    .returning();
  return ok(res, toImportJobDTO(job), 201);
}

async function handleList(res: VercelResponse, db: Db) {
  const rows = await db
    .select()
    .from(importJobs)
    .orderBy(desc(importJobs.createdAt))
    .limit(20);
  return ok(res, rows.map(toImportJobDTO));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      return await handleCreate(req, res, getDb());
    } catch (e) {
      console.error('POST /api/import/jobs failed', e);
      return err(res, 500, 'server_error', 'Failed to create import job');
    }
  }
  if (req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    try {
      return await handleList(res, getDb());
    } catch (e) {
      console.error('GET /api/import/jobs failed', e);
      return err(res, 500, 'server_error', 'Failed to list import jobs');
    }
  }
  return methodNotAllowed(res, ['GET', 'POST']);
}
