import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { checkCsrf, requireAuth } from '../lib/auth.js';
import {
  getDb,
  entries,
  categories,
  entryTags,
  importJobs,
  importItems,
} from '../lib/db.js';
import {
  importJobBatchSchema,
  type ImportJobBatchItem,
} from '../lib/validate.js';
import { err, ok, methodNotAllowed } from '../lib/respond.js';
import {
  insertPhotos,
  queryParam,
  upsertTagIds,
  type Db,
  type PhotoInput,
} from '../lib/entry-dto.js';

const idSchema = z.string().uuid();

type BatchResult = {
  source_entry_id: string;
  status: 'imported' | 'duplicate' | 'failed';
  entry_id?: string;
  error?: string;
};

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

async function findExistingEntryId(
  db: Db,
  source: string,
  sourceEntryId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.source, source), eq(entries.sourceEntryId, sourceEntryId)))
    .limit(1);
  return row?.id ?? null;
}

async function upsertImportItem(
  db: Db,
  jobId: string,
  sourceEntryId: string,
  status: 'imported' | 'duplicate' | 'failed',
  entryId: string | null,
  errorMessage: string | null,
): Promise<void> {
  await db
    .insert(importItems)
    .values({ importJobId: jobId, sourceEntryId, status, entryId, errorMessage })
    .onConflictDoUpdate({
      target: [importItems.importJobId, importItems.sourceEntryId],
      set: { status, entryId, errorMessage },
    });
}

/**
 * Resolve the category for a batch item:
 *  - category_id: must exist (else the item fails)
 *  - category {slug,...}: find by slug, else create with the given attributes
 *  - neither: fall back to the 'otros' category, then to the first category
 *    by sort_order (else the item fails — entries.category_id is NOT NULL)
 */
async function resolveCategoryId(db: Db, item: ImportJobBatchItem): Promise<string> {
  if (item.category_id) {
    const [c] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, item.category_id))
      .limit(1);
    if (!c) throw new Error(`Category not found: ${item.category_id}`);
    return c.id;
  }
  if (item.category) {
    const [c] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, item.category.slug))
      .limit(1);
    if (c) return c.id;
    const [created] = await db
      .insert(categories)
      .values({
        name: item.category.name,
        slug: item.category.slug,
        color: item.category.color ?? '#6b7280',
        icon: item.category.icon ?? 'tag',
      })
      .returning({ id: categories.id });
    return created.id;
  }
  const [otros] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, 'otros'))
    .limit(1);
  if (otros) return otros.id;
  const [first] = await db
    .select({ id: categories.id })
    .from(categories)
    .orderBy(asc(categories.sortOrder))
    .limit(1);
  if (first) return first.id;
  throw new Error('No category available: provide category_id or category');
}

function toPhotoInput(p: ImportJobBatchItem['photos'][number]): PhotoInput {
  return {
    pathname: p.pathname,
    thumbnailPathname: p.thumbnailPathname ?? null,
    url: p.url ?? null,
    thumbnailUrl: p.thumbnailUrl ?? null,
    alt_text: p.alt_text ?? null,
    sort_order: p.sort_order ?? 0,
  };
}

async function importOneItem(
  db: Db,
  jobId: string,
  source: string,
  item: ImportJobBatchItem,
): Promise<BatchResult> {
  // Duplicate check: idempotency relies on the partial unique index
  // entries_source_unique_idx (source, source_entry_id).
  let entryId = await findExistingEntryId(db, source, item.source_entry_id);
  if (entryId) {
    await upsertImportItem(db, jobId, item.source_entry_id, 'duplicate', entryId, null);
    return { source_entry_id: item.source_entry_id, status: 'duplicate', entry_id: entryId };
  }

  try {
    const categoryId = await resolveCategoryId(db, item);

    let insertedId: string;
    try {
      const [created] = await db
        .insert(entries)
        .values({
          eventDate: item.event_date,
          title: item.title,
          description: item.description,
          categoryId,
          rating: item.rating ?? null,
          location: item.location ?? null,
          source,
          sourceEntryId: item.source_entry_id,
        })
        .returning({ id: entries.id });
      insertedId = created.id;
    } catch (e) {
      // Lost a race with a concurrent batch (or a retry): the unique index
      // fired, so treat as duplicate instead of failing.
      if (isUniqueViolation(e)) {
        const raced = await findExistingEntryId(db, source, item.source_entry_id);
        if (raced) {
          await upsertImportItem(db, jobId, item.source_entry_id, 'duplicate', raced, null);
          return { source_entry_id: item.source_entry_id, status: 'duplicate', entry_id: raced };
        }
      }
      throw e;
    }

    const tagIds = await upsertTagIds(db, item.tags);
    if (tagIds.length) {
      await db
        .insert(entryTags)
        .values(tagIds.map((tagId) => ({ entryId: insertedId, tagId })))
        .onConflictDoNothing();
    }
    await insertPhotos(db, insertedId, item.photos.map(toPhotoInput));

    await upsertImportItem(db, jobId, item.source_entry_id, 'imported', insertedId, null);
    return { source_entry_id: item.source_entry_id, status: 'imported', entry_id: insertedId };
  } catch (e) {
    // Per-item failure: record it, keep the batch going.
    const message = e instanceof Error ? e.message : 'Unknown import error';
    await upsertImportItem(db, jobId, item.source_entry_id, 'failed', null, message.slice(0, 2000));
    return { source_entry_id: item.source_entry_id, status: 'failed', error: message };
  }
}

/**
 * POST /api/import/jobs/[id]/batch — import one batch of items (max 50).
 *
 * NOTE: the Neon HTTP driver has no interactive transactions, so items are
 * processed with sequential awaits. Each item is atomic on its own (single
 * INSERT per table); a batch is NOT all-or-nothing — failed items are
 * recorded with their error and the client retries or inspects them.
 * Idempotent: re-sending the same batch yields 'duplicate' results, never
 * double inserts (enforced by entries_source_unique_idx).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!checkCsrf(req, res)) return;
  if (!requireAuth(req, res)) return;

  const id = queryParam(req, 'id');
  if (!id || !idSchema.safeParse(id).success) {
    return err(res, 400, 'bad_request', 'Invalid job id');
  }
  const parsed = importJobBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }

  try {
    const db = getDb();
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    if (!job) return err(res, 404, 'not_found', 'Import job not found');

    const results: BatchResult[] = [];
    let imported = 0;
    let duplicates = 0;
    let failed = 0;

    for (const item of parsed.data.items) {
      const r = await importOneItem(db, id, job.source, item);
      results.push(r);
      if (r.status === 'imported') imported += 1;
      else if (r.status === 'duplicate') duplicates += 1;
      else failed += 1;
    }

    const prevCheckpoint = (job.checkpoint ?? {}) as Record<string, unknown>;
    await db
      .update(importJobs)
      .set({
        status: 'running',
        processedItems: (job.processedItems ?? 0) + parsed.data.items.length,
        importedItems: (job.importedItems ?? 0) + imported,
        duplicateItems: (job.duplicateItems ?? 0) + duplicates,
        failedItems: (job.failedItems ?? 0) + failed,
        checkpoint: { ...prevCheckpoint, lastBatchAt: new Date().toISOString() },
      })
      .where(eq(importJobs.id, id));

    return ok(res, { results });
  } catch (e) {
    console.error('POST /api/import/jobs/[id]/batch failed', e);
    return err(res, 500, 'server_error', 'Failed to process import batch');
  }
}
