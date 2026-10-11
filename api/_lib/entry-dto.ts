/**
 * MyLife Journal — shared DTO builders and small DB helpers for API routes
 * (node-only).
 *
 * EntryDTO assembly always fetches category + tags + images so every route
 * returns the same shape (see api/_lib/types.ts).
 */
import type { VercelRequest } from '@vercel/node';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  getDb,
  entries,
  categories,
  tags,
  entryTags,
  entryImages,
} from './db.js';
import type { EntryDTO, ImportJobDTO, ImportJobStatus } from './types.js';

export type Db = ReturnType<typeof getDb>;

/** First value of a query param (string | string[] | undefined). */
export function queryParam(req: VercelRequest, name: string): string | undefined {
  const v = req.query[name];
  return Array.isArray(v) ? v[0] : v;
}

function toIso(v: Date | string | null | undefined): string {
  if (!v) return '';
  return v instanceof Date ? v.toISOString() : String(v);
}

export interface PhotoInput {
  pathname: string;
  thumbnailPathname?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  altText?: string | null;
  alt_text?: string | null;
  sortOrder?: number;
  sort_order?: number;
}

function photoFields(p: PhotoInput, sortOrder: number) {
  return {
    blobPathname: p.pathname,
    thumbnailPathname: p.thumbnailPathname ?? null,
    url: p.url ?? null,
    thumbnailUrl: p.thumbnailUrl ?? null,
    altText: p.altText ?? p.alt_text ?? null,
    sortOrder: p.sortOrder ?? p.sort_order ?? sortOrder,
  };
}

/** Insert entry_images rows for an entry. */
export async function insertPhotos(db: Db, entryId: string, photos: PhotoInput[]): Promise<void> {
  if (!photos.length) return;
  await db.insert(entryImages).values(
    photos.map((p, i) => ({ entryId, ...photoFields(p, i) })),
  );
}

/**
 * Upsert tag names (insert on conflict do nothing) and return their ids.
 * Names are trimmed and deduplicated; empty names are dropped.
 */
export async function upsertTagIds(db: Db, names: string[]): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
  if (!unique.length) return [];
  await db.insert(tags).values(unique.map((name) => ({ name }))).onConflictDoNothing();
  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, unique));
  // Preserve caller order
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  return unique.map((n) => byName.get(n)).filter((id): id is string => Boolean(id));
}

/** Replace all tag links of an entry (used by PATCH full-replacement). */
export async function replaceEntryTags(db: Db, entryId: string, names: string[]): Promise<void> {
  await db.delete(entryTags).where(eq(entryTags.entryId, entryId));
  const ids = await upsertTagIds(db, names);
  if (ids.length) {
    await db
      .insert(entryTags)
      .values(ids.map((tagId) => ({ entryId, tagId })))
      .onConflictDoNothing();
  }
}

/**
 * Build EntryDTOs for the given entry ids, preserving input order.
 * Entries whose category join fails are skipped (should not happen).
 */
export async function buildEntryDTOs(db: Db, entryIds: string[]): Promise<EntryDTO[]> {
  if (!entryIds.length) return [];
  const rows = await db
    .select({ e: entries, c: categories })
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .where(inArray(entries.id, entryIds));
  const byId = new Map(rows.map((r) => [r.e.id, r] as const));

  const tagRows =
    entryIds.length > 0
      ? await db
          .select({ entryId: entryTags.entryId, name: tags.name })
          .from(entryTags)
          .innerJoin(tags, eq(entryTags.tagId, tags.id))
          .where(inArray(entryTags.entryId, entryIds))
      : [];
  const imgRows = await db
    .select()
    .from(entryImages)
    .where(inArray(entryImages.entryId, entryIds))
    .orderBy(asc(entryImages.sortOrder), asc(entryImages.createdAt));

  const tagsByEntry = new Map<string, string[]>();
  for (const t of tagRows) {
    const arr = tagsByEntry.get(t.entryId) ?? [];
    arr.push(t.name);
    tagsByEntry.set(t.entryId, arr);
  }
  const imgsByEntry = new Map<string, typeof imgRows>();
  for (const img of imgRows) {
    const arr = imgsByEntry.get(img.entryId) ?? [];
    arr.push(img);
    imgsByEntry.set(img.entryId, arr);
  }

  const out: EntryDTO[] = [];
  for (const id of entryIds) {
    const r = byId.get(id);
    if (!r) continue;
    const { e, c } = r;
    out.push({
      id: e.id,
      event_date: e.eventDate, // SQL DATE — string 'YYYY-MM-DD', no TZ conversion
      title: e.title,
      description: e.description,
      category: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color,
        icon: c.icon,
        sort_order: c.sortOrder,
      },
      rating: e.rating,
      location: e.location,
      source: e.source,
      source_entry_id: e.sourceEntryId,
      tags: tagsByEntry.get(id) ?? [],
      photos: (imgsByEntry.get(id) ?? []).map((img) => ({
        id: img.id,
        blob_pathname: img.blobPathname,
        thumbnail_pathname: img.thumbnailPathname,
        url: img.url,
        thumbnail_url: img.thumbnailUrl,
        alt_text: img.altText,
        sort_order: img.sortOrder ?? 0,
      })),
      created_at: toIso(e.createdAt),
      updated_at: toIso(e.updatedAt),
    });
  }
  return out;
}

/** Build a single EntryDTO, or null when the entry does not exist. */
export async function buildEntryDTO(db: Db, entryId: string): Promise<EntryDTO | null> {
  const dtos = await buildEntryDTOs(db, [entryId]);
  return dtos[0] ?? null;
}

/** Map an import_jobs row to its DTO. */
export function toImportJobDTO(j: {
  id: string;
  source: string;
  status: string | null;
  fileName: string | null;
  totalItems: number | null;
  processedItems: number | null;
  importedItems: number | null;
  duplicateItems: number | null;
  failedItems: number | null;
  createdAt: Date | string | null;
  completedAt: Date | string | null;
}): ImportJobDTO {
  return {
    id: j.id,
    source: j.source,
    status: (j.status ?? 'pending') as ImportJobStatus,
    file_name: j.fileName,
    total_items: j.totalItems ?? 0,
    processed_items: j.processedItems ?? 0,
    imported_items: j.importedItems ?? 0,
    duplicate_items: j.duplicateItems ?? 0,
    failed_items: j.failedItems ?? 0,
    created_at: toIso(j.createdAt),
    completed_at: j.completedAt ? toIso(j.completedAt) : null,
  };
}
