import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { checkCsrf, requireAuth } from '../_lib/auth.js';
import { getDb, categories, entries } from '../_lib/db.js';
import { categorySchema } from '../_lib/validate.js';
import { err, ok, methodNotAllowed } from '../_lib/respond.js';
import { queryParam, type Db } from '../_lib/entry-dto.js';
import type { CategoryDTO } from '../_lib/types.js';

const idSchema = z.string().uuid();

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

function toDTO(c: typeof categories.$inferSelect, entryCount: number): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color,
    icon: c.icon,
    sort_order: c.sortOrder,
    entry_count: entryCount,
  };
}

async function entryCount(db: Db, categoryId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(entries)
    .where(eq(entries.categoryId, categoryId));
  return n;
}

async function handlePatch(id: string, req: VercelRequest, res: VercelResponse, db: Db) {
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const b = parsed.data;
  if (Object.keys(b).length === 0) {
    return err(res, 400, 'bad_request', 'No fields to update');
  }

  const [current] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!current) return err(res, 404, 'not_found', 'Category not found');

  if (b.slug && b.slug !== current.slug) {
    const [taken] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, b.slug))
      .limit(1);
    if (taken) {
      return err(res, 409, 'conflict', `Category slug already exists: ${b.slug}`);
    }
  }

  try {
    const [updated] = await db
      .update(categories)
      .set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.slug !== undefined ? { slug: b.slug } : {}),
        ...(b.color !== undefined ? { color: b.color } : {}),
        ...(b.icon !== undefined ? { icon: b.icon } : {}),
        ...(b.sort_order !== undefined ? { sortOrder: b.sort_order } : {}),
      })
      .where(eq(categories.id, id))
      .returning();
    return ok(res, toDTO(updated, await entryCount(db, id)));
  } catch (e) {
    if (isUniqueViolation(e)) {
      return err(res, 409, 'conflict', 'Category slug already exists');
    }
    throw e;
  }
}

async function handleDelete(id: string, req: VercelRequest, res: VercelResponse, db: Db) {
  const [current] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!current) return err(res, 404, 'not_found', 'Category not found');

  const count = await entryCount(db, id);
  const reassignTo = queryParam(req, 'reassignTo');

  if (count > 0 && !reassignTo) {
    return err(res, 409, 'category_in_use', 'Category has entries; pass ?reassignTo=<category-id> to move them first', {
      entryCount: count,
    });
  }

  if (reassignTo) {
    if (!idSchema.safeParse(reassignTo).success || reassignTo === id) {
      return err(res, 400, 'bad_request', 'reassignTo must be a different, valid category id');
    }
    const [target] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, reassignTo))
      .limit(1);
    if (!target) return err(res, 400, 'bad_request', 'reassignTo category not found');
    await db.update(entries).set({ categoryId: reassignTo }).where(eq(entries.categoryId, id));
  }

  await db.delete(categories).where(eq(categories.id, id));
  return ok(res, { ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = queryParam(req, 'id');
  if (!id || !idSchema.safeParse(id).success) {
    return err(res, 400, 'bad_request', 'Invalid category id');
  }
  if (req.method === 'PATCH' || req.method === 'PUT') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      return await handlePatch(id, req, res, getDb());
    } catch (e) {
      console.error('PATCH /api/categories/[id] failed', e);
      return err(res, 500, 'server_error', 'Failed to update category');
    }
  }
  if (req.method === 'DELETE') {
    if (!checkCsrf(req, res)) return;
    if (!requireAuth(req, res)) return;
    try {
      return await handleDelete(id, req, res, getDb());
    } catch (e) {
      console.error('DELETE /api/categories/[id] failed', e);
      return err(res, 500, 'server_error', 'Failed to delete category');
    }
  }
  return methodNotAllowed(res, ['PATCH', 'PUT', 'DELETE']);
}
