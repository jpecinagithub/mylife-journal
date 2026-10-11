import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, desc, eq, exists, gte, lte, not, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { checkCsrf, requireAuth } from '../lib/auth.js';
import { getDb, entries, categories, entryTags, entryImages } from '../lib/db.js';
import { entriesQuerySchema, entryInputSchema } from '../lib/validate.js';
import { err, ok, methodNotAllowed } from '../lib/respond.js';
import {
  buildEntryDTOs,
  insertPhotos,
  queryParam,
  upsertTagIds,
  type Db,
} from '../lib/entry-dto.js';

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Escape LIKE wildcards so search is literal. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function buildConditions(q: {
  search?: string;
  category?: string;
  year?: number;
  month?: number;
  from?: string;
  to?: string;
  rating?: number;
  hasPhotos?: 'true' | 'false';
}): SQL[] {
  const conds: SQL[] = [];
  if (q.search && q.search.trim()) {
    const pattern = `%${escapeLike(q.search.trim())}%`;
    conds.push(
      sql`(${entries.title} || ' ' || ${entries.description}) ILIKE ${pattern} ESCAPE '\\'`,
    );
  }
  if (q.category) {
    conds.push(eq(categories.slug, q.category));
  }
  if (q.year) {
    // Derive a date range from year/month with pure integer arithmetic —
    // never construct a JS Date from event_date (TZ-shift risk).
    const m0 = q.month ?? 1;
    const m1 = q.month ?? 12;
    const from = `${q.year}-${pad2(m0)}-01`;
    const to = `${q.year}-${pad2(m1)}-${daysInMonth(q.year, m1)}`;
    conds.push(gte(entries.eventDate, from), lte(entries.eventDate, to));
  }
  if (q.from) conds.push(gte(entries.eventDate, q.from));
  if (q.to) conds.push(lte(entries.eventDate, q.to));
  if (q.rating !== undefined) conds.push(eq(entries.rating, q.rating));
  if (q.hasPhotos) {
    const has = exists(
      sql`SELECT 1 FROM ${entryImages} WHERE ${entryImages.entryId} = ${entries.id}`,
    );
    conds.push(q.hasPhotos === 'true' ? has : not(has));
  }
  return conds;
}

async function handleList(req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = entriesQuerySchema.safeParse({
    search: queryParam(req, 'search'),
    category: queryParam(req, 'category'),
    year: queryParam(req, 'year'),
    month: queryParam(req, 'month'),
    from: queryParam(req, 'from'),
    to: queryParam(req, 'to'),
    rating: queryParam(req, 'rating'),
    hasPhotos: queryParam(req, 'hasPhotos'),
    page: queryParam(req, 'page'),
    limit: queryParam(req, 'limit'),
    sort: queryParam(req, 'sort'),
  });
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid query parameters', parsed.error.issues);
  }
  const q = parsed.data;
  if (q.month !== undefined && q.year === undefined) {
    return err(res, 400, 'bad_request', 'month requires year');
  }

  const conds = buildConditions(q);
  const where = conds.length ? and(...conds) : undefined;
  const dir = q.sort === 'asc' ? asc : desc;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .where(where);

  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .where(where)
    .orderBy(dir(entries.eventDate), dir(entries.createdAt), dir(entries.id))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const items = await buildEntryDTOs(
    db,
    rows.map((r) => r.id),
  );
  return ok(res, { items, total, page: q.page, limit: q.limit });
}

async function handleCreate(req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = entryInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const b = parsed.data;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, b.category_id))
    .limit(1);
  if (!cat) {
    return err(res, 400, 'bad_request', `Category not found: ${b.category_id}`);
  }

  const [created] = await db
    .insert(entries)
    .values({
      eventDate: b.event_date, // 'YYYY-MM-DD' string straight into the DATE column
      title: b.title,
      description: b.description,
      categoryId: b.category_id,
      rating: b.rating ?? null,
      location: b.location ?? null,
      source: 'manual',
    })
    .returning({ id: entries.id });

  const tagIds = await upsertTagIds(db, b.tags);
  if (tagIds.length) {
    await db
      .insert(entryTags)
      .values(tagIds.map((tagId) => ({ entryId: created.id, tagId })))
      .onConflictDoNothing();
  }
  await insertPhotos(db, created.id, b.photos);

  const dto = await buildEntryDTOs(db, [created.id]);
  return ok(res, dto[0], 201);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    try {
      const db = getDb();
      return await handleList(req, res, db);
    } catch (e) {
      console.error('GET /api/entries failed', e);
      return err(res, 500, 'server_error', 'Failed to list entries');
    }
  }
  if (req.method === 'POST') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      const db = getDb();
      return await handleCreate(req, res, db);
    } catch (e) {
      console.error('POST /api/entries failed', e);
      return err(res, 500, 'server_error', 'Failed to create entry');
    }
  }
  return methodNotAllowed(res, ['GET', 'POST']);
}
