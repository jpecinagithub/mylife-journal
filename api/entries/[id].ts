import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { checkCsrf, requireAuth } from '../_lib/auth.js';
import { getDb, entries, categories, entryImages } from '../_lib/db.js';
import { deleteBlob } from '../_lib/blob.js';
import { entryInputSchema } from '../_lib/validate.js';
import { err, ok, methodNotAllowed } from '../_lib/respond.js';
import {
  buildEntryDTO,
  insertPhotos,
  queryParam,
  replaceEntryTags,
  type Db,
} from '../_lib/entry-dto.js';
import { z } from 'zod';

const idSchema = z.string().uuid();

/** Collect blob URLs of an entry's images (best-effort deletion, never throws). */
async function deleteEntryBlobs(db: Db, entryId: string): Promise<void> {
  const rows = await db
    .select({ url: entryImages.url, thumbnailUrl: entryImages.thumbnailUrl })
    .from(entryImages)
    .where(eq(entryImages.entryId, entryId));
  const urls = rows.flatMap((r) => [r.url, r.thumbnailUrl]).filter((u): u is string => !!u);
  if (!urls.length) return;
  try {
    await deleteBlob(urls);
  } catch (e) {
    console.error('Best-effort blob deletion failed', e);
  }
}

async function handleGet(id: string, res: VercelResponse, db: Db) {
  const dto = await buildEntryDTO(db, id);
  if (!dto) return err(res, 404, 'not_found', 'Entry not found');
  return ok(res, dto);
}

const entryPatchSchema = entryInputSchema.partial();

async function handlePatch(id: string, req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = entryPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const b = parsed.data;
  if (Object.keys(b).length === 0) {
    return err(res, 400, 'bad_request', 'No fields to update');
  }

  const dto = await buildEntryDTO(db, id);
  if (!dto) return err(res, 404, 'not_found', 'Entry not found');

  if (b.category_id) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, b.category_id))
      .limit(1);
    if (!cat) return err(res, 400, 'bad_request', `Category not found: ${b.category_id}`);
  }

  // photos present (even []) => full replacement: remove old rows + blobs.
  if (b.photos !== undefined) {
    await deleteEntryBlobs(db, id);
    await db.delete(entryImages).where(eq(entryImages.entryId, id));
    await insertPhotos(db, id, b.photos);
  }
  if (b.tags !== undefined) {
    await replaceEntryTags(db, id, b.tags);
  }

  await db
    .update(entries)
    .set({
      ...(b.event_date !== undefined ? { eventDate: b.event_date } : {}),
      ...(b.title !== undefined ? { title: b.title } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.category_id !== undefined ? { categoryId: b.category_id } : {}),
      ...(b.rating !== undefined ? { rating: b.rating ?? null } : {}),
      ...(b.location !== undefined ? { location: b.location ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(entries.id, id));

  const updated = await buildEntryDTO(db, id);
  return ok(res, updated);
}

async function handleDelete(id: string, res: VercelResponse, db: Db) {
  const dto = await buildEntryDTO(db, id);
  if (!dto) return err(res, 404, 'not_found', 'Entry not found');

  // Collect blob URLs before the cascade deletes the rows.
  await deleteEntryBlobs(db, id);
  await db.delete(entries).where(eq(entries.id, id));
  return ok(res, { ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = queryParam(req, 'id');
  if (!id || !idSchema.safeParse(id).success) {
    return err(res, 400, 'bad_request', 'Invalid entry id');
  }
  if (req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    try {
      return await handleGet(id, res, getDb());
    } catch (e) {
      console.error('GET /api/entries/[id] failed', e);
      return err(res, 500, 'server_error', 'Failed to fetch entry');
    }
  }
  if (req.method === 'PATCH' || req.method === 'PUT') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      return await handlePatch(id, req, res, getDb());
    } catch (e) {
      console.error('PATCH /api/entries/[id] failed', e);
      return err(res, 500, 'server_error', 'Failed to update entry');
    }
  }
  if (req.method === 'DELETE') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      return await handleDelete(id, res, getDb());
    } catch (e) {
      console.error('DELETE /api/entries/[id] failed', e);
      return err(res, 500, 'server_error', 'Failed to delete entry');
    }
  }
  return methodNotAllowed(res, ['GET', 'PATCH', 'PUT', 'DELETE']);
}
