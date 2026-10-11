/**
 * Parser for the Diaro Online "Export to DOCX" format.
 *
 * Diaro Online (diaroapp.com) exports the whole journal as a .docx whose
 * body is a flat sequence of paragraphs (no tables, no styles):
 *
 *   \t<day>  <Weekday> / <Month> <Year>\t<hh:mm> a/p. m.   (date header)
 *   <Title>
 *   <text paragraphs...>
 *    <temp>°C <Folder>[ <address> (<lat>, <lng>)]              (meta line)
 *   <photo paragraphs: empty text, one VML v:shape each>
 *
 * Photos are embedded as VML shapes (<v:imagedata r:id="rIdN"/>) and live in
 * word/media/. Small shapes (<=20pt wide, e.g. the 9pt weather icons) are
 * not entry photos and are ignored. Everything was verified against a real
 * 1033-entry / 1220-photo export before shipping this parser.
 *
 * Notes / deliberate limitations:
 * - The DOCX carries no entry UIDs: sourceEntryId is deterministic per file
 *   (`docx-<eventDate>-<index>`), so re-importing the same file is
 *   idempotent, but cross-format duplicate detection (ZIP vs DOCX of the
 *   same journal) cannot match entries by ID.
 * - The DOCX carries no tags and no 1-5 rating: both stay empty/null.
 * - The temperature in the meta line has no field in the entry model, so it
 *   is intentionally not preserved (same call as diaro-xml makes for mood).
 * - Folder names are discovered from "pure" meta lines (weather + folder
 *   only, no address): a compound line is split by longest-prefix match
 *   against that discovered set. A folder that never appears without an
 *   address degrades gracefully to folder=null with the full string kept
 *   as location.
 */

import JSZip from 'jszip';
import type {
  ImportFolder,
  NormalizedEntry,
  ParsedImport,
  PhotoInput,
  ProgressCallback,
} from './types.js';

/* ------------------------------------------------------------------ */
/* Message constants (English; the UI translates before display).      */
/* ------------------------------------------------------------------ */

const MSG_NO_DOCUMENT = 'word/document.xml not found inside the DOCX file';
const MSG_XML_INVALID = 'word/document.xml could not be parsed as XML';
const MSG_PHOTO_MISSING = 'Photo file not found in DOCX, skipped: ';

/* ------------------------------------------------------------------ */
/* Namespaces and patterns                                             */
/* ------------------------------------------------------------------ */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const V_NS = 'urn:schemas-microsoft-com:vml';

/** Shapes wider than this (points) count as entry photos, not icons. */
const PHOTO_MIN_WIDTH_PT = 20;

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** "\t27  Domingo / Septiembre 2026\t05:23 p. m." (tab-separated). */
const DATE_RE =
  /^\s*(\d{1,2})\s+\S+\s*\/\s*(\S+)\s+(\d{4})\t(\d{1,2}):(\d{2})\s*([ap])\.\s*m\.\s*$/;
/** " 23.6°C Pelis" or " 18.6°C Pelis Calle X, (lat, lng)" or " 23.6°C". */
const META_RE = /^\s*([\d.]+)\s*°C\s*(.*)$/;
const COORD_RE = /\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)\s*$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/* Low-level OOXML reading                                             */
/* ------------------------------------------------------------------ */

/** Visible text of a paragraph: w:t runs joined, w:tab as a real tab. */
function paragraphText(p: Element): string {
  let out = '';
  const doc = p.ownerDocument;
  const walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as Element | null;
  while (node) {
    if (node.namespaceURI === W_NS) {
      if (node.localName === 't') out += node.textContent ?? '';
      else if (node.localName === 'tab') out += '\t';
    }
    node = walker.nextNode() as Element | null;
  }
  return out;
}

/** rIds of entry photos in a paragraph (VML shapes wider than icons). */
function paragraphPhotoRIds(p: Element): string[] {
  const rids: string[] = [];
  const shapes = p.getElementsByTagNameNS(V_NS, 'shape');
  for (const shape of Array.from(shapes)) {
    const style = shape.getAttribute('style') ?? '';
    const m = /width:([\d.]+)pt/.exec(style);
    const widthPt = m ? parseFloat(m[1]) : 0;
    if (widthPt <= PHOTO_MIN_WIDTH_PT) continue; // weather icons, logo…
    const datas = shape.getElementsByTagNameNS(V_NS, 'imagedata');
    for (const data of Array.from(datas)) {
      const rid = data.getAttributeNS(R_NS, 'id');
      if (rid) rids.push(rid);
    }
  }
  return rids;
}

function parseXml(text: string): XMLDocument {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(MSG_XML_INVALID);
  }
  return doc;
}

/** rId -> media file name for image relationships. */
function readImageRels(relsText: string): Map<string, string> {
  const map = new Map<string, string>();
  const doc = parseXml(relsText);
  const rels = doc.getElementsByTagName('Relationship');
  for (const rel of Array.from(rels)) {
    const type = rel.getAttribute('Type') ?? '';
    if (!type.includes('/image')) continue;
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target') ?? '';
    const fileName = target.split('/').pop() ?? '';
    if (id && fileName) map.set(id, fileName);
  }
  return map;
}

function findZipEntry(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const exact = zip.file(path);
  if (exact) return exact;
  const wanted = path.toLowerCase();
  for (const key of Object.keys(zip.files)) {
    const entry = zip.files[key];
    if (!entry || entry.dir) continue;
    if (key.toLowerCase() === wanted) return entry;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Entry-level parsing                                                 */
/* ------------------------------------------------------------------ */

type SplitMeta = {
  folder: string | null;
  location: string | null;
};

function splitFolderLocation(raw: string, knownFolders: Set<string>): SplitMeta {
  let folder: string | null = null;
  let rest = raw;
  const candidates = [...knownFolders].sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    if (rest === candidate) return { folder: candidate, location: null };
    if (rest.startsWith(candidate + ' ')) {
      folder = candidate;
      rest = rest.slice(candidate.length + 1);
      break;
    }
  }
  // Trailing "(lat, lng)" belongs to the location; keep it in the string.
  let location: string | null = null;
  const coordMatch = COORD_RE.exec(rest);
  if (coordMatch) {
    const address = rest.slice(0, coordMatch.index).trim().replace(/,+$/, '');
    const coords = `(${coordMatch[1]}, ${coordMatch[2]})`;
    location = address ? `${address} ${coords}` : coords;
  } else if (rest.trim()) {
    location = rest.trim();
  }
  return { folder, location };
}

/** "27 … Septiembre 2026\t05:23 p. m." -> "2026-09-27", or null. */
function parseEventDate(header: string): string | null {
  const m = DATE_RE.exec(header);
  if (!m) return null;
  const month = MESES[m[2].toLowerCase()];
  if (!month) return null;
  void m; // (day, time-of-day intentionally unused: DATE column is day-only)
  return `${m[3]}-${pad2(month)}-${pad2(parseInt(m[1], 10))}`;
}

/* ------------------------------------------------------------------ */
/* Main parser                                                         */
/* ------------------------------------------------------------------ */

export async function parseDiaroDocx(
  file: File | Blob,
  onProgress?: ProgressCallback,
): Promise<ParsedImport> {
  onProgress?.(5);
  const zip = await JSZip.loadAsync(file);

  const docEntry = findZipEntry(zip, 'word/document.xml');
  if (!docEntry) throw new Error(MSG_NO_DOCUMENT);
  const relsEntry = findZipEntry(zip, 'word/_rels/document.xml.rels');

  onProgress?.(15);
  const doc = parseXml(await docEntry.async('text'));
  const ridToFile = relsEntry ? readImageRels(await relsEntry.async('text')) : new Map();

  const bodies = doc.getElementsByTagNameNS(W_NS, 'body');
  const body = bodies.length > 0 ? bodies[0] : null;
  const paras: Element[] = body
    ? Array.from(body.children).filter(
        (el): el is Element => el.namespaceURI === W_NS && el.localName === 'p',
      )
    : [];
  onProgress?.(25);

  // Split the flat paragraph stream into entries at date headers.
  const starts: number[] = [];
  const headerText: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const text = paragraphText(paras[i]);
    if (DATE_RE.test(text)) {
      starts.push(i);
      headerText.push(text);
    }
  }

  // Discover folder names from "pure" meta lines (no comma, no coords).
  const knownFolders = new Set<string>();
  const metaRemainders: (string | null)[] = [];
  for (let k = 0; k < starts.length; k++) {
    const end = k + 1 < starts.length ? starts[k + 1] : paras.length;
    let remainder: string | null = null;
    for (let i = starts[k] + 1; i < end; i++) {
      const text = paragraphText(paras[i]);
      if (!text.trim()) continue;
      const m = META_RE.exec(text);
      if (m) {
        remainder = m[2].trim();
        if (remainder && !remainder.includes(',') && !COORD_RE.test(remainder)) {
          knownFolders.add(remainder);
        }
        break;
      }
    }
    metaRemainders.push(remainder);
  }
  onProgress?.(35);

  const warnings: string[] = [];
  const entries: NormalizedEntry[] = [];
  const folderSeen = new Set<string>();

  for (let k = 0; k < starts.length; k++) {
    const end = k + 1 < starts.length ? starts[k + 1] : paras.length;
    const eventDate = parseEventDate(headerText[k]);
    if (!eventDate) continue; // header matched loosely but month unknown: skip

    let title = '';
    const texts: string[] = [];
    const photos: PhotoInput[] = [];
    let sortOrder = 0;

    for (let i = starts[k] + 1; i < end; i++) {
      const p = paras[i];
      const rids = paragraphPhotoRIds(p);
      for (const rid of rids) {
        const fileName = ridToFile.get(rid);
        if (!fileName) {
          warnings.push(MSG_PHOTO_MISSING + rid);
          continue;
        }
        const mediaEntry =
          findZipEntry(zip, 'word/media/' + fileName) ?? findZipEntry(zip, fileName);
        if (!mediaEntry) {
          warnings.push(MSG_PHOTO_MISSING + fileName);
          continue;
        }
        const blob = await mediaEntry.async('blob');
        photos.push({ fileName, blob, sortOrder: sortOrder++ });
      }
      const text = paragraphText(p);
      if (!text.trim()) continue;
      if (META_RE.test(text)) continue; // meta line handled below
      if (!title && texts.length === 0) title = text.trim();
      else texts.push(text.trim());
    }

    const remainder = metaRemainders[k];
    const { folder, location } = remainder
      ? splitFolderLocation(remainder, knownFolders)
      : { folder: null, location: null };
    if (folder) folderSeen.add(folder);

    entries.push({
      sourceEntryId: `docx-${eventDate}-${String(k).padStart(4, '0')}`,
      eventDate,
      title,
      description: texts.join('\n\n'),
      categoryHint: folder,
      tags: [],
      location,
      rating: null, // the DOCX export carries no rating
      photos,
    });

    if (starts.length > 0) onProgress?.(35 + Math.round((60 * (k + 1)) / starts.length));
  }

  // Oldest first; stable for equal dates.
  entries.sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));

  const folders: ImportFolder[] = [...folderSeen].map((title) => ({
    id: `docx-folder-${title}`,
    title,
  }));

  onProgress?.(100);
  return { entries, folders, warnings };
}

// Re-exported for tests that want the pure helpers without a DOM.
export const __test__ = { DATE_RE, META_RE, MESES, parseEventDate, splitFolderLocation };
