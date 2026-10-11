import type { VercelRequest, VercelResponse } from '@vercel/node';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { requireAuth } from './_lib/auth.js';
import { getDb, entries, categories, entryImages } from './_lib/db.js';
import { err, ok, methodNotAllowed } from './_lib/respond.js';

interface YearCountRow {
  year: number;
  count: number;
}

/**
 * GET /api/stats — dashboard aggregates.
 * books/movies/trips are entry counts for the 'libros'/'peliculas'/'viajes'
 * slugs (0 when the slug does not exist).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;

  try {
    const db = getDb();

    const [{ totalEntries }] = await db
      .select({ totalEntries: sql<number>`count(*)::int` })
      .from(entries);

    const yearsRes = await db.execute(
      sql`SELECT DISTINCT EXTRACT(YEAR FROM event_date)::int AS year FROM entries ORDER BY year ASC`,
    );
    const yearsActive = (yearsRes.rows as unknown as YearCountRow[]).map((r) => Number(r.year));

    const byCategory = await db
      .select({
        slug: categories.slug,
        name: categories.name,
        color: categories.color,
        count: sql<number>`count(${entries.id})::int`,
      })
      .from(categories)
      .leftJoin(entries, eq(entries.categoryId, categories.id))
      .groupBy(categories.id, categories.slug, categories.name, categories.color)
      .orderBy(desc(sql`count(${entries.id})`), asc(categories.name));

    const [{ totalPhotos }] = await db
      .select({ totalPhotos: sql<number>`count(*)::int` })
      .from(entryImages);

    const perYearRes = await db.execute(
      sql`SELECT EXTRACT(YEAR FROM event_date)::int AS year, COUNT(*)::int AS count FROM entries GROUP BY 1 ORDER BY 1 ASC`,
    );
    const perYear = (perYearRes.rows as unknown as YearCountRow[]).map((r) => ({
      year: Number(r.year),
      count: Number(r.count),
    }));

    const countFor = (slug: string) =>
      Number(byCategory.find((c) => c.slug === slug)?.count ?? 0);

    return ok(res, {
      totalEntries: Number(totalEntries),
      yearsActive,
      byCategory: byCategory.map((c) => ({
        slug: c.slug,
        name: c.name,
        color: c.color,
        count: Number(c.count),
      })),
      totalPhotos: Number(totalPhotos),
      perYear,
      books: countFor('libros'),
      movies: countFor('peliculas'),
      trips: countFor('viajes'),
    });
  } catch (e) {
    console.error('GET /api/stats failed', e);
    return err(res, 500, 'server_error', 'Failed to compute stats');
  }
}
