import type { VercelRequest, VercelResponse } from '@vercel/node';
import { asc, desc, sql } from 'drizzle-orm';
import { requireAuth } from '../_lib/auth.js';
import { getDb, entries, categories, tags } from '../_lib/db.js';
import { exportJsonQuerySchema } from '../_lib/validate.js';
import { err, ok, methodNotAllowed } from '../_lib/respond.js';
import { buildEntryDTOs, queryParam, type Db } from '../_lib/entry-dto.js';

/**
 * GET /api/export/json — paginated JSON backup.
 * The client pages through all entries, assembles the full backup, and
 * fetches photo blobs into a ZIP itself.
 */
async function handleExport(req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = exportJsonQuerySchema.safeParse({
    page: queryParam(req, 'page'),
    limit: queryParam(req, 'limit'),
  });
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid query parameters', parsed.error.issues);
  }
  const { page, limit } = parsed.data;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(entries);

  const catRows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const tagRows = await db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name));

  const entryRows = await db
    .select({ id: entries.id })
    .from(entries)
    .orderBy(desc(entries.eventDate), desc(entries.createdAt), asc(entries.id))
    .limit(limit)
    .offset((page - 1) * limit);
  const dtos = await buildEntryDTOs(
    db,
    entryRows.map((r) => r.id),
  );

  return ok(res, {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: catRows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      icon: c.icon,
      sort_order: c.sortOrder,
    })),
    tags: tagRows.map((t) => t.name),
    entries: dtos,
    pagination: { page, limit, total: Number(total) },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;
  try {
    return await handleExport(req, res, getDb());
  } catch (e) {
    console.error('GET /api/export/json failed', e);
    return err(res, 500, 'server_error', 'Failed to export entries');
  }
}
