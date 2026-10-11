/**
 * Best-effort plain-text import parser.
 *
 * The file is split into blocks on blank lines. Within each block, leading
 * directive lines are recognized:
 *   "Date: 2024-05-06"   -> eventDate (also accepts the flexible date formats)
 *   "Title: ..."         -> title
 *   "#hashtag"           -> a tag (may appear on any line of the block)
 * Everything else is the description.
 *
 * When no Date directive is present the block is skipped with a warning
 * (dates are never invented). When no Title directive is present, the first
 * non-directive line becomes the title.
 */

import type { NormalizedEntry, ParsedImport } from './types.js';
import { parseFlexibleDate } from './dates.js';

/* ------------------------------------------------------------------ */
/* Message constants (English; the UI translates before display).      */
/* ------------------------------------------------------------------ */

const MSG_MISSING_DATE = 'Text block skipped, no parseable date: ';
const MSG_TITLE_FALLBACK = 'Text blocks used the first line as title: ';

const DATE_DIRECTIVE = /^\s*date\s*:\s*(.+?)\s*$/i;
const TITLE_DIRECTIVE = /^\s*title\s*:\s*(.+?)\s*$/i;
const HASHTAG = /#([\p{L}\p{N}_-]+)/gu;

export function parseTxt(text: string): ParsedImport {
  // Normalize line endings, then split on blank lines.
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const warnings: string[] = [];
  const entries: NormalizedEntry[] = [];
  let titleFallbacks = 0;

  blocks.forEach((block, i) => {
    const lines = block.split('\n');
    let eventDate: string | null = null;
    let title = '';
    const tags: string[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      const dateMatch = DATE_DIRECTIVE.exec(line);
      if (dateMatch) {
        const parsed = parseFlexibleDate(dateMatch[1]);
        if (parsed) eventDate = parsed;
        continue;
      }
      const titleMatch = TITLE_DIRECTIVE.exec(line);
      if (titleMatch) {
        title = titleMatch[1].trim();
        continue;
      }
      for (const tagMatch of line.matchAll(HASHTAG)) {
        tags.push(tagMatch[1]);
      }
      bodyLines.push(line);
    }

    if (!eventDate) {
      const preview = block.slice(0, 60).replace(/\n/g, ' ');
      warnings.push(MSG_MISSING_DATE + `block ${i + 1}: "${preview}…"`);
      return;
    }

    if (!title && bodyLines.length > 0) {
      title = bodyLines[0].trim();
      titleFallbacks++;
    }

    entries.push({
      sourceEntryId: `txt:${i}`,
      eventDate,
      title,
      description: bodyLines.join('\n').trim(),
      categoryHint: null,
      tags,
      location: null,
      rating: null,
      photos: [],
    });
  });

  if (titleFallbacks > 0) {
    warnings.push(MSG_TITLE_FALLBACK + String(titleFallbacks));
  }

  entries.sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));

  return { entries, folders: [], warnings };
}
