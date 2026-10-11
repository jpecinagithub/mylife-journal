/**
 * Import runner: uploads photos and posts entries to the /api/import/*
 * backend in resumable, idempotent batches.
 *
 * Flow:
 *   1. POST /api/import/jobs { source, fileName, totalItems } -> jobId
 *   2. Photos: each entry photo is resized client-side (max 1600px, WebP
 *      q0.8; 480px thumbnail), then POST /api/images/upload with a
 *      concurrency limit (default 3). Phase 'photos'.
 *   3. Entries in batches of 40 -> POST /api/import/jobs/:id/batch.
 *      Phase 'entries'.
 *   4. POST /api/import/jobs/:id/complete -> final ImportReport. Phase 'done'.
 *
 * Idempotency: the server dedupes on (source, source_entry_id), so
 * re-running the same file yields duplicates, never double entries.
 * Resume: runImport always creates a NEW job; a checkpointed job stays
 * resumable server-side, but client-side resume of an aborted run is simply
 * a fresh runImport call (duplicates are counted, not duplicated).
 *
 * AbortSignal is honored between chunks; an abort throws and leaves the
 * server-side job in place with its checkpoint.
 *
 * Assumptions about backend response shapes (defensive parsing, documented
 * for the backend agent):
 *   - create job: { jobId } | { id } | { job: { id } }
 *   - image upload: an object with some of { pathname, thumbnailPathname,
 *     url, thumbnailUrl }; passed through, plus alt_text/sort_order added.
 *   - batch: { results: [{ source_entry_id, status, message? }] } where
 *     status is 'imported' | 'duplicate' | 'failed', and/or a summary
 *     { imported, duplicates, failed, errors }.
 *   - complete: an ImportReport-shaped object; local tallies fill any gaps.
 */

import type {
  ImportReport,
  NormalizedEntry,
  PhotoInput,
  RunImportOptions,
} from './types.js';

/* ------------------------------------------------------------------ */
/* Message constants (English; the UI translates before display).      */
/* ------------------------------------------------------------------ */

const MSG_UNAUTHORIZED = 'unauthorized';
const MSG_PHOTO_RESIZE_FAILED = 'Photo could not be decoded or resized, skipped: ';
const MSG_NO_DEFAULT_CATEGORY = 'No __default__ category mapping; entries without a category mapping were skipped: ';
const MSG_HINT_UNMAPPED = 'Category hint had no mapping, used __default__: ';
const MSG_JOB_CREATE_FAILED = 'Could not create the import job';

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) throw new Error(MSG_UNAUTHORIZED);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text.slice(0, 300) || res.statusText}`);
  }
  return (await res.json()) as T;
}

function extractJobId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.jobId === 'string') return b.jobId;
  if (typeof b.id === 'string') return b.id;
  const job = b.job as Record<string, unknown> | undefined;
  if (job && typeof job.id === 'string') return job.id;
  return null;
}

/* ------------------------------------------------------------------ */
/* Photo resizing (canvas, browser-native)                             */
/* ------------------------------------------------------------------ */

type ResizedPhoto = { data: string; contentType: string; fileName: string };

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}

function base64Of(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

async function resizePhoto(blob: Blob, maxDimension: number, quality: number): Promise<ResizedPhoto> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);

    const toBlob = (type: string): Promise<Blob | null> =>
      new Promise((resolve) => canvas.toBlob(resolve, type, quality));

    const webp = await toBlob('image/webp');
    if (webp) {
      return { data: base64Of(await blobToDataUrl(webp)), contentType: 'image/webp', fileName: '' };
    }
    const jpeg = await toBlob('image/jpeg'); // older Safari fallback
    if (jpeg) {
      return { data: base64Of(await blobToDataUrl(jpeg)), contentType: 'image/jpeg', fileName: '' };
    }
    throw new Error('encode-failed');
  } finally {
    bitmap.close();
  }
}

/* ------------------------------------------------------------------ */
/* Photo upload with concurrency limit                                 */
/* ------------------------------------------------------------------ */

type UploadedPhotoRef = {
  pathname?: string;
  thumbnailPathname?: string;
  url?: string;
  thumbnailUrl?: string;
  alt_text: string;
  sort_order: number;
  [key: string]: unknown;
};

async function uploadPhotos(
  entries: NormalizedEntry[],
  concurrency: number,
  onPhotoDone: (done: number, total: number) => void,
  warnings: string[],
  signal?: AbortSignal,
): Promise<Map<PhotoInput, UploadedPhotoRef>> {
  const all: PhotoInput[] = entries.flatMap((e) => e.photos);
  const total = all.length;
  const results = new Map<PhotoInput, UploadedPhotoRef>();
  if (total === 0) return results;

  // Dedupe identical Blob objects (same photo referenced twice).
  const byBlob = new Map<Blob, Promise<UploadedPhotoRef | null>>();
  let done = 0;

  const process = async (photo: PhotoInput): Promise<void> => {
    signal?.throwIfAborted();
    let pending = byBlob.get(photo.blob);
    if (!pending) {
      pending = (async (): Promise<UploadedPhotoRef | null> => {
        let full: ResizedPhoto;
        let thumb: ResizedPhoto;
        try {
          full = await resizePhoto(photo.blob, 1600, 0.8);
          thumb = await resizePhoto(photo.blob, 480, 0.8);
        } catch {
          warnings.push(MSG_PHOTO_RESIZE_FAILED + photo.fileName);
          return null;
        }
        full.fileName = photo.fileName;
        const uploadBody = {
          fileName: photo.fileName,
          contentType: full.contentType,
          data: full.data,
          thumbnail: { contentType: thumb.contentType, data: thumb.data },
        };
        const res = await apiPost<Record<string, unknown>>('/api/images/upload', uploadBody, signal);
        return {
          ...res,
          alt_text: photo.fileName,
          sort_order: photo.sortOrder,
        } as UploadedPhotoRef;
      })();
      byBlob.set(photo.blob, pending);
    }
    const ref = await pending;
    if (ref) results.set(photo, ref);
    done++;
    onPhotoDone(done, total);
  };

  // Bounded worker pool.
  const limit = Math.max(1, Math.floor(concurrency));
  let index = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, total); w++) {
    workers.push(
      (async () => {
        while (index < all.length) {
          signal?.throwIfAborted();
          const photo = all[index++];
          await process(photo);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ */
/* Batch tallies                                                       */
/* ------------------------------------------------------------------ */

type BatchResultItem = {
  source_entry_id?: string;
  status?: string;
  message?: string;
};

function tallyBatchResponse(
  body: unknown,
  items: { source_entry_id: string }[],
  report: ImportReport,
): void {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const results = Array.isArray(b.results) ? (b.results as BatchResultItem[]) : null;
  if (results) {
    for (const r of results) {
      const id = typeof r.source_entry_id === 'string' ? r.source_entry_id : '';
      const status = typeof r.status === 'string' ? r.status.toLowerCase() : 'imported';
      if (status === 'duplicate' || status === 'skipped_duplicate') {
        report.duplicates++;
      } else if (status === 'failed' || status === 'error') {
        report.failed++;
        report.errors.push({ sourceEntryId: id, message: r.message ?? 'batch-failed' });
      } else {
        report.imported++;
      }
    }
    return;
  }

  // Summary-style response, or nothing at all (assume success on HTTP 200).
  if (typeof b.imported === 'number') report.imported += b.imported;
  else report.imported += items.length;
  if (typeof b.duplicates === 'number') {
    report.imported -= Math.min(report.imported, b.duplicates); // avoid double counting
    report.duplicates += b.duplicates;
  }
  if (typeof b.failed === 'number') report.failed += b.failed;
  if (Array.isArray(b.errors)) {
    for (const e of b.errors as { sourceEntryId?: string; source_entry_id?: string; message?: string }[]) {
      report.errors.push({
        sourceEntryId: e.sourceEntryId ?? e.source_entry_id ?? '',
        message: e.message ?? 'batch-failed',
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

const BATCH_SIZE = 40;

export async function runImport(opts: RunImportOptions): Promise<ImportReport> {
  const {
    entries,
    categoryMapping,
    source = 'diaro',
    fileName,
    photoConcurrency = 3,
    onProgress,
    signal,
  } = opts;

  signal?.throwIfAborted();

  // (1) Create the import job.
  const created = await apiPost<unknown>(
    '/api/import/jobs',
    { source, fileName, totalItems: entries.length },
    signal,
  );
  const jobId = extractJobId(created);
  if (!jobId) throw new Error(MSG_JOB_CREATE_FAILED);

  const report: ImportReport = {
    jobId,
    total: entries.length,
    imported: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
  };

  // (2) Upload photos with bounded concurrency.
  const warnings: string[] = [];
  const uploaded = await uploadPhotos(
    entries,
    photoConcurrency,
    (done, total) => onProgress?.(done, total, 'photos'),
    warnings,
    signal,
  );

  // (3) Send entries in batches of 40.
  const defaultCategoryId = categoryMapping['__default__'];
  if (!defaultCategoryId) {
    warnings.push(MSG_NO_DEFAULT_CATEGORY + String(entries.length));
  }
  let unmappedHints = 0;

  const photoRefsFor = (entry: NormalizedEntry): UploadedPhotoRef[] =>
    entry.photos
      .filter((p) => uploaded.has(p))
      .map((p) => uploaded.get(p) as UploadedPhotoRef);

  for (let start = 0; start < entries.length; start += BATCH_SIZE) {
    signal?.throwIfAborted();
    const chunk = entries.slice(start, start + BATCH_SIZE);
    const items = chunk
      .map((entry) => {
        const hint = entry.categoryHint ?? '__default__';
        let categoryId = categoryMapping[hint];
        if (!categoryId) {
          unmappedHints++;
          if (unmappedHints <= 5) warnings.push(MSG_HINT_UNMAPPED + hint);
          categoryId = defaultCategoryId;
        }
        if (!categoryId) {
          report.failed++;
          report.errors.push({
            sourceEntryId: entry.sourceEntryId,
            message: 'no-category-mapping',
          });
          return null;
        }
        return {
          source_entry_id: entry.sourceEntryId,
          event_date: entry.eventDate,
          title: entry.title,
          description: entry.description,
          category_id: categoryId,
          rating: entry.rating,
          location: entry.location,
          tags: entry.tags,
          photos: photoRefsFor(entry),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (items.length > 0) {
      const body = await apiPost<unknown>(`/api/import/jobs/${jobId}/batch`, { items }, signal);
      tallyBatchResponse(body, items, report);
    }
    onProgress?.(Math.min(start + BATCH_SIZE, entries.length), entries.length, 'entries');
  }

  // (4) Complete the job; prefer the server's authoritative report.
  const completed = await apiPost<unknown>(`/api/import/jobs/${jobId}/complete`, {}, signal);
  const c = (typeof completed === 'object' && completed !== null ? completed : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const finalReport: ImportReport = {
    jobId,
    total: num(c.total, report.total),
    imported: num(c.imported, report.imported),
    duplicates: num(c.duplicates, report.duplicates),
    failed: num(c.failed, report.failed),
    errors: Array.isArray(c.errors) ? (c.errors as ImportReport['errors']) : report.errors,
  };

  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn('[import]', w);
  }
  if (unmappedHints > 0) {
    // eslint-disable-next-line no-console
    console.warn('[import]', `${unmappedHints} entries used the __default__ category mapping`);
  }

  onProgress?.(finalReport.total, finalReport.total, 'done');
  return finalReport;
}
