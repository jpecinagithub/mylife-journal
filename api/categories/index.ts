import type { VercelRequest, VercelResponse } from '@vercel/node';
import { asc, eq, sql } from 'drizzle-orm';
import { checkCsrf, requireAuth } from '../_lib/auth.js';
import { getDb, categories } from '../_lib/db.js';
import { categorySchema } from '../_lib/validate.js';
import { err, ok, methodNotAllowed } from '../_lib/respond.js';
import type { CategoryDTO } from '../_lib/types.js';
import type { Db } from '../_lib/entry-dto.js';

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

async function handleList(res: VercelResponse, db: Db) {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      color: categories.color,
      icon: categories.icon,
      sort_order: categories.sortOrder,
      entry_count: sql<number>`(SELECT count(*)::int FROM entries e WHERE e.category_id = ${categories.id})`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const items: CategoryDTO[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color,
    icon: r.icon,
    sort_order: r.sort_order,
    entry_count: Number(r.entry_count),
  }));
  return ok(res, items);
}

async function handleCreate(req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const b = parsed.data;

  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, b.slug))
    .limit(1);
  if (existing.length) {
    return err(res, 409, 'conflict', `Category slug already exists: ${b.slug}`);
  }

  try {
    const [created] = await db
      .insert(categories)
      .values({
        name: b.name,
        slug: b.slug,
        color: b.color,
        icon: b.icon,
        sortOrder: b.sort_order ?? 0,
      })
      .returning();
    const dto: CategoryDTO = {
      id: created.id,
      name: created.name,
      slug: created.slug,
      color: created.color,
      icon: created.icon,
      sort_order: created.sortOrder,
      entry_count: 0,
    };
    return ok(res, dto, 201);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return err(res, 409, 'conflict', `Category slug already exists: ${b.slug}`);
    }
    throw e;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    try {
      return await handleList(res, getDb());
    } catch (e) {
      console.error('GET /api/categories failed', e);
      return err(res, 500, 'server_error', 'Failed to list categories');
    }
  }
  if (req.method === 'POST') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      return await handleCreate(req, res, getDb());
    } catch (e) {
      console.error('POST /api/categories failed', e);
      return err(res, 500, 'server_error', 'Failed to create category');
    }
  }
  return methodNotAllowed(res, ['GET', 'POST']);
}
