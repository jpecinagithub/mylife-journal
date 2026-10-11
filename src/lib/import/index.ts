/**
 * Format detection and parse dispatch for the import library.
 *
 * detectFormat uses, in order:
 *   1. the file extension (.zip, .csv, .json, .txt, .md),
 *   2. the ZIP magic bytes ('PK') — a zip is opened and sniffed for a
 *      DiaroBackup.xml entry (case-insensitive, any nesting),
 *   3. a content sniff of the first bytes when the extension is unknown.
 *
 * parseFile dispatches to the matching parser and reports progress.
 */

import JSZip from 'jszip';
import type { ImportFormat, ParsedImport, ProgressCallback, ImportFolder } from './types.js';
import { parseDiaroZip } from './diaro-xml.js';
import { parseDiaroDocx } from './diaro-docx.js';
import { parseCsv } from './csv.js';
import { parseJson } from './json.js';
import { parseTxt } from './txt.js';

// Public contract: re-export everything the UI and tests consume.
export type {
  PhotoInput,
  NormalizedEntry,
  ImportFolder,
  ParsedImport,
  ImportReport,
  ImportFormat,
  ProgressCallback,
  RunImportOptions,
} from './types.js';
export type { ImportAnalysis } from './analyze.js';
export { analyzeLocal } from './analyze.js';
export { runImport } from './runner.js';
/** Backwards-compatible alias used by the ImportPage UI. */
export type SourceFolder = ImportFolder;

const ZIP_MAGIC = [0x50, 0x4b]; // 'PK'

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

async function readHead(file: File | Blob, bytes: number): Promise<Uint8Array> {
  const buf = await file.slice(0, bytes).arrayBuffer();
  return new Uint8Array(buf);
}

function isZipMagic(head: Uint8Array): boolean {
  return head.length >= 2 && head[0] === ZIP_MAGIC[0] && head[1] === ZIP_MAGIC[1];
}

/** True when the ZIP contains a DiaroBackup.xml entry (any path, any case). */
async function zipContainsDiaroBackup(file: File | Blob): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    return Object.keys(zip.files).some((path) => /(^|\/)diarobackup\.xml$/i.test(path));
  } catch {
    return false;
  }
}

/** True when the ZIP is a Word document (has word/document.xml). */
async function zipContainsWordDocument(file: File | Blob): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    return Object.keys(zip.files).some((path) => /(^|\/)word\/document\.xml$/i.test(path));
  } catch {
    return false;
  }
}

async function detectZipFormat(file: File | Blob): Promise<ImportFormat> {
  const head = await readHead(file, 4);
  if (!isZipMagic(head)) return 'unknown';
  if (await zipContainsDiaroBackup(file)) return 'diaro-zip';
  if (await zipContainsWordDocument(file)) return 'diaro-docx';
  return 'unknown';
}

/** Very cheap text sniff used when the extension tells us nothing. */
function sniffTextFormat(head: string): ImportFormat {
  const s = head.trimStart();
  if (!s) return 'unknown';
  if (s.startsWith('<')) return 'unknown'; // XML outside a zip is not supported
  if (s.startsWith('{') || s.startsWith('[')) return 'json';
  const firstLine = s.split('\n', 1)[0].toLowerCase();
  const looksLikeCsv =
    (firstLine.includes(',') || firstLine.includes(';') || firstLine.includes('\t')) &&
    /(date|fecha|title|description|text)/.test(firstLine);
  if (looksLikeCsv) return 'csv';
  if (/^\s*date\s*:/i.test(s)) return 'txt';
  return 'txt'; // plain prose defaults to the best-effort text parser
}

export async function detectFormat(file: File): Promise<ImportFormat> {
  const ext = extensionOf(file.name);

  if (ext === 'zip') {
    return detectZipFormat(file);
  }
  if (ext === 'docx') {
    const format = await detectZipFormat(file);
    return format === 'unknown' ? 'unknown' : format;
  }
  if (ext === 'csv') return 'csv';
  if (ext === 'json') return 'json';
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') return 'txt';

  // Unknown extension: sniff the content.
  const head = await readHead(file, 4);
  if (isZipMagic(head)) {
    return detectZipFormat(file);
  }
  const textHead = await readHead(file, 4096);
  return sniffTextFormat(new TextDecoder().decode(textHead));
}

export async function parseFile(file: File, onProgress?: ProgressCallback): Promise<ParsedImport> {
  const format = await detectFormat(file);
  onProgress?.(2);
  switch (format) {
    case 'diaro-zip':
      return parseDiaroZip(file, (pct) => onProgress?.(2 + Math.round(pct * 0.98)));
    case 'diaro-docx':
      return parseDiaroDocx(file, (pct) => onProgress?.(2 + Math.round(pct * 0.98)));
    case 'csv':
      onProgress?.(40);
      return parseCsv(await file.text());
    case 'json':
      onProgress?.(40);
      return parseJson(await file.text());
    case 'txt':
      onProgress?.(40);
      return parseTxt(await file.text());
    case 'unknown':
    default:
      throw new Error(
        `Could not detect the file format of "${file.name}". Supported formats: Diaro backup ZIP, Diaro Online DOCX export, CSV, JSON, TXT.`,
      );
  }
}
