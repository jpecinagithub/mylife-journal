import type { VercelRequest, VercelResponse } from '@vercel/node';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { requireAuth } from '../lib/auth.js';
import { getDb, tags, entryTags } from '../lib/db.js';
import { err, ok, methodNotAllowed } from '../lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        count: sql<number>`count(${entryTags.tagId})::int`,
      })
      .from(tags)
      .leftJoin(entryTags, eq(tags.id, entryTags.tagId))
      .groupBy(tags.id, tags.name)
      .orderBy(desc(sql`count(${entryTags.tagId})`), asc(tags.name))
      .limit(200);
    return ok(
      res,
      rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) })),
    );
  } catch (e) {
    console.error('GET /api/tags failed', e);
    return err(res, 500, 'server_error', 'Failed to list tags');
  }
}
