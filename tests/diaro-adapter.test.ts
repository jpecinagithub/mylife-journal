/**
 * MyLife Journal — Diaro backup import contract tests.
 *
 * Exercises the real parser (src/lib/import/diaro-xml.ts) against
 * tests/fixtures/diaro-sample.xml packed into a ZIP in-memory with JSZip.
 *
 * Fixture facts (tests/fixtures/diaro-sample.xml, all data synthetic):
 * - Test Entry One  (uid 4444…): 2024-05-06T08:30Z, tz +02:00 -> "2024-05-06",
 *   folder "Test Folder", tag "test-tag", location "Test Park, 1 Example
 *   Street, Testville", primary photo test-photo-primary.jpg (position 2 in
 *   the XML, primary via primary_photo_uid) + test-photo-second.jpg (pos 1).
 * - Test Entry Two  (uid 5555…): 2024-05-07T16:05Z, tz +02:00 -> "2024-05-07",
 *   no folder/tags/location/photos.
 * Parser sorts oldest-first, so entries[0] is Test Entry One.
 *
 * TODO: when the `@/lib/import` facade with `parseFile` lands, switch this
 * suite to `parseFile` (detection + dispatch) and keep these as the
 * Diaro-specific assertions underneath.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { parseDiaroZip } from '../src/lib/import/diaro-xml.js';
import type { ParsedImport } from '../src/lib/import/types.js';

// 1x1 transparent PNG, base64 — stands in for real backup photos.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const ONE = '44444444444444444444444444444444'; // Test Entry One
const TWO = '55555555555555555555555555555555'; // Test Entry Two
const PRIMARY = 'test-photo-primary.jpg';
const SECOND = 'test-photo-second.jpg';

async function buildZip(includeSecondPhoto: boolean): Promise<Blob> {
  const xml = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'diaro-sample.xml'), 'utf8');
  const zip = new JSZip();
  zip.file('DiaroBackup.xml', xml);
  zip.file(`media/photo/${PRIMARY}`, PNG_1X1);
  if (includeSecondPhoto) zip.file(`media/photo/${SECOND}`, PNG_1X1);
  // NOTE: the other referenced photo is deliberately NOT packed when
  // includeSecondPhoto is false — that exercises the missing-file warning path.
  return zip.generateAsync({ type: 'blob' });
}

async function parse(includeSecondPhoto: boolean): Promise<ParsedImport> {
  return parseDiaroZip(await buildZip(includeSecondPhoto));
}

describe('parseDiaroZip (Diaro backup contract)', () => {
  it('parses 2 entries, oldest first', async () => {
    const { entries } = await parse(true);
    expect(entries).toHaveLength(2);
    expect(entries[0].sourceEntryId).toBe(ONE);
    expect(entries[1].sourceEntryId).toBe(TWO);
  });

  it('computes YYYY-MM-DD honoring tz_offset (+02:00)', async () => {
    const { entries } = await parse(true);
    // 1714984200000 ms = 2024-05-06T08:30:00Z -> wall clock 2024-05-06
    expect(entries[0].eventDate).toBe('2024-05-06');
    // 1715097900000 ms = 2024-05-07T16:05:00Z -> wall clock 2024-05-07
    expect(entries[1].eventDate).toBe('2024-05-07');
  });

  it('maps folder -> categoryHint and resolves tags + location', async () => {
    const { entries, folders } = await parse(true);
    const one = entries[0];
    expect(one.title).toBe('Test Entry One');
    expect(one.categoryHint).toBe('Test Folder');
    expect(one.tags).toEqual(['test-tag']);
    expect(one.location).toBe('Test Park, 1 Example Street, Testville');
    expect(one.rating).toBeNull(); // Diaro has no 1-5 rating
    expect(entries[1].categoryHint).toBeNull();
    expect(entries[1].tags).toEqual([]);
    expect(folders).toContainEqual({
      id: '11111111111111111111111111111111',
      title: 'Test Folder',
      color: '#4a90d9',
    });
  });

  it('orders attachments primary-first with sequential sortOrder', async () => {
    const { entries, warnings } = await parse(true);
    const photos = entries[0].photos;
    expect(photos).toHaveLength(2);
    // primary_photo_uid wins over the lower position value in the XML
    expect(photos[0].fileName).toBe(PRIMARY);
    expect(photos[0].sortOrder).toBe(0);
    expect(photos[1].fileName).toBe(SECOND);
    expect(photos[1].sortOrder).toBe(1);
    for (const p of photos) expect(p.blob.size).toBeGreaterThan(0);
    expect(warnings.filter((w) => w.includes('not found'))).toHaveLength(0);
  });

  it('missing photo -> warning, not a crash', async () => {
    const { entries, warnings } = await parse(false);
    expect(entries).toHaveLength(2); // still parses
    expect(entries[0].photos).toHaveLength(1);
    expect(entries[0].photos[0].fileName).toBe(PRIMARY);
    const missing = warnings.filter((w) => w.includes('Photo file not found in backup'));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain(SECOND);
  });

  it('entry without attachments parses cleanly', async () => {
    const { entries } = await parse(true);
    expect(entries[1].photos).toEqual([]);
    expect(entries[1].description).toBe('An entry without folder, location, tags or photos.');
  });
});
