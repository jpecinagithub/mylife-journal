import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, inArray } from 'drizzle-orm';
import { checkCsrf, requireAuth } from '../_lib/auth.js';
import { getDb, entries } from '../_lib/db.js';
import { importPreviewSchema } from '../_lib/validate.js';
import { err, ok, methodNotAllowed } from '../_lib/respond.js';

/**
 * POST /api/import/preview — dry-run duplicate detection for an import.
 * Body: { source, items: [{ source_entry_id, event_date, title }] } (max 5000).
 * Returns totals plus which source_entry_ids already exist for the source.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!checkCsrf(req, res)) return;
  if (!requireAuth(req, res)) return;

  const parsed = importPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const { source, items } = parsed.data;

  try {
    const db = getDb();
    const ids = [...new Set(items.map((i) => i.source_entry_id))];
    const existing = await db
      .select({ sourceEntryId: entries.sourceEntryId })
      .from(entries)
      .where(and(eq(entries.source, source), inArray(entries.sourceEntryId, ids)));
    const existingSet = new Set(
      existing.map((r) => r.sourceEntryId).filter((s): s is string => s !== null),
    );
    const duplicates = items
      .map((i) => i.source_entry_id)
      .filter((sid) => existingSet.has(sid));
    const uniqueDuplicates = [...new Set(duplicates)];

    const dates = items.map((i) => i.event_date).sort();
    return ok(res, {
      total: items.length,
      newCount: items.length - uniqueDuplicates.length,
      duplicates: uniqueDuplicates,
      dateRange: { min: dates[0] ?? null, max: dates[dates.length - 1] ?? null },
    });
  } catch (e) {
    console.error('POST /api/import/preview failed', e);
    return err(res, 500, 'server_error', 'Failed to preview import');
  }
}
