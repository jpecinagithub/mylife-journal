import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';
import { requireAuth } from './_lib/auth.js';
import { getDb } from './_lib/db.js';
import { calendarQuerySchema } from './_lib/validate.js';
import { err, ok, methodNotAllowed } from './_lib/respond.js';
import { queryParam } from './_lib/entry-dto.js';

const pad2 = (n: number) => String(n).padStart(2, '0');

interface CalendarRow {
  date: string;
  count: number;
  categories: { slug: string; color: string }[] | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;

  const parsed = calendarQuerySchema.safeParse({
    year: queryParam(req, 'year'),
    month: queryParam(req, 'month'),
  });
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid query parameters', parsed.error.issues);
  }
  const { year, month } = parsed.data;

  // Month bounds as 'YYYY-MM-DD' strings via integer arithmetic — the DATE
  // column is compared as text, no JS Date involved.
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = `${nextYear}-${pad2(nextMonth)}-01`;

  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT event_date::text AS date,
             COUNT(*)::int AS count,
             json_agg(DISTINCT jsonb_build_object('slug', c.slug, 'color', c.color)) AS categories
      FROM entries e
      JOIN categories c ON c.id = e.category_id
      WHERE event_date >= ${monthStart} AND event_date < ${monthEnd}
      GROUP BY event_date
      ORDER BY event_date ASC
    `);
    const days = (result.rows as unknown as CalendarRow[]).map((r) => ({
      date: r.date,
      count: Number(r.count),
      categories: r.categories ?? [],
    }));
    // Only days with at least one entry are returned (GROUP BY).
    return ok(res, { year, month, days });
  } catch (e) {
    console.error('GET /api/calendar failed', e);
    return err(res, 500, 'server_error', 'Failed to build calendar');
  }
}
