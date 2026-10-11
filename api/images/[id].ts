import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { checkCsrf, requireAuth } from '../_lib/auth.js';
import { getDb, entryImages } from '../_lib/db.js';
import { deleteBlob } from '../_lib/blob.js';
import { err, ok, methodNotAllowed } from '../_lib/respond.js';
import { queryParam } from '../_lib/entry-dto.js';

const idSchema = z.string().uuid();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);
  if (!checkCsrf(req, res)) return;
  if (!requireAuth(req, res)) return;

  const id = queryParam(req, 'id');
  if (!id || !idSchema.safeParse(id).success) {
    return err(res, 400, 'bad_request', 'Invalid image id');
  }

  try {
    const db = getDb();
    const [row] = await db.select().from(entryImages).where(eq(entryImages.id, id)).limit(1);
    if (!row) return err(res, 404, 'not_found', 'Image not found');

    // Best-effort blob deletion; the DB row is removed regardless.
    const urls = [row.url, row.thumbnailUrl].filter((u): u is string => !!u);
    if (urls.length) {
      try {
        await deleteBlob(urls);
      } catch (e) {
        console.error('Best-effort blob deletion failed', e);
      }
    }
    await db.delete(entryImages).where(eq(entryImages.id, id));
    return ok(res, { ok: true });
  } catch (e) {
    console.error('DELETE /api/images/[id] failed', e);
    return err(res, 500, 'server_error', 'Failed to delete image');
  }
}
