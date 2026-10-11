import type { VercelRequest, VercelResponse } from '@vercel/node';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAuth } from '../lib/auth.js';
import { getDb, entries, categories, entryTags, tags } from '../lib/db.js';
import { err, methodNotAllowed } from '../lib/respond.js';

const CSV_MAX_ROWS = 20000;

/** RFC 4180 cell escaping: quote when the value contains ", \n or \r. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/export/csv — all entries (cap 20000) as a downloadable CSV.
 * Tags are pipe-separated; photo_count is a per-entry subquery.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: entries.id,
        eventDate: entries.eventDate,
        title: entries.title,
        description: entries.description,
        categorySlug: categories.slug,
        rating: entries.rating,
        location: entries.location,
        photoCount: sql<number>`(SELECT count(*)::int FROM entry_images ei WHERE ei.entry_id = ${entries.id})`,
        createdAt: entries.createdAt,
      })
      .from(entries)
      .innerJoin(categories, eq(entries.categoryId, categories.id))
      .orderBy(desc(entries.eventDate), desc(entries.createdAt), asc(entries.id))
      .limit(CSV_MAX_ROWS);

    const ids = rows.map((r) => r.id);
    const tagRows = ids.length
      ? await db
          .select({ entryId: entryTags.entryId, name: tags.name })
          .from(entryTags)
          .innerJoin(tags, eq(entryTags.tagId, tags.id))
          .where(inArray(entryTags.entryId, ids))
      : [];
    const tagsByEntry = new Map<string, string[]>();
    for (const t of tagRows) {
      const arr = tagsByEntry.get(t.entryId) ?? [];
      arr.push(t.name);
      tagsByEntry.set(t.entryId, arr);
    }

    const lines = [
      'id,event_date,title,description,category_slug,rating,location,tags,photo_count,created_at',
    ];
    for (const r of rows) {
      const createdAt = r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? '');
      lines.push(
        [
          csvCell(r.id),
          csvCell(r.eventDate),
          csvCell(r.title),
          csvCell(r.description),
          csvCell(r.categorySlug),
          csvCell(r.rating),
          csvCell(r.location),
          csvCell((tagsByEntry.get(r.id) ?? []).join('|')),
          csvCell(r.photoCount),
          csvCell(createdAt),
        ].join(','),
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mylife-export-${today}.csv"`);
    res.status(200).send(lines.join('\n'));
  } catch (e) {
    console.error('GET /api/export/csv failed', e);
    return err(res, 500, 'server_error', 'Failed to export CSV');
  }
}
