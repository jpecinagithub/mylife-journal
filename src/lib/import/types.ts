/**
 * Public contract for the MyLife Journal import library.
 *
 * These types are the shared interface between the import parsers,
 * the ImportPage UI, and the /api/import/* backend endpoints.
 * The UI codes against these signatures — do not change them without
 * updating both sides.
 */

/** A single photo attached to an entry, as produced by a file parser. */
export type PhotoInput = {
  fileName: string;
  blob: Blob;
  sortOrder: number;
};

/**
 * One journal entry in the normalized shape every parser produces.
 * eventDate is the wall-clock calendar date in the entry's own timezone,
 * always 'YYYY-MM-DD' and timezone-free.
 */
export type NormalizedEntry = {
  sourceEntryId: string;
  eventDate: string; // 'YYYY-MM-DD', timezone-free
  title: string;
  description: string;
  categoryHint: string | null;
  tags: string[];
  location: string | null;
  rating: number | null;
  photos: PhotoInput[];
};

/** Folders declared inside the imported file (e.g. Diaro folders). */
export type ImportFolder = {
  id: string;
  title: string;
  color?: string;
};

/** The parsed, pre-import representation of an import file. */
export type ParsedImport = {
  entries: NormalizedEntry[];
  folders: ImportFolder[];
  warnings: string[];
};

/** The server-confirmed result of an import run. */
export type ImportReport = {
  jobId: string;
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: { sourceEntryId: string; message: string }[];
};

/** Formats the import library can detect and parse. */
export type ImportFormat = 'diaro-zip' | 'diaro-docx' | 'csv' | 'json' | 'txt' | 'unknown';

export type ProgressCallback = (pct: number) => void;

/**
 * Options for runImport (see runner.ts).
 * Matches the shared contract exactly; `phase` is a plain string so the
 * runner may report new phases without breaking the UI's callback type.
 */
export type RunImportOptions = {
  entries: NormalizedEntry[];
  /** categoryHint (or '__default__') -> category_id */
  categoryMapping: Record<string, string>;
  source?: string;
  fileName?: string;
  photoConcurrency?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
  signal?: AbortSignal;
};
