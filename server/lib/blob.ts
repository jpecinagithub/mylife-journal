/**
 * MyLife Journal — Vercel Blob helpers (node-only).
 *
 * Privacy model:
 * - Every uploaded file gets a 128-bit random pathname (addRandomSuffix),
 *   so URLs are effectively unguessable — there is no public listing and no
 *   directory traversal possible.
 * - Blob URLs are ONLY ever exposed through authenticated API responses.
 *   The frontend never hardcodes blob hostnames.
 * - This is the pragmatic Vercel-free-tier privacy model: no signed URLs on
 *   the free tier, so obscurity + auth-gated responses is the protection.
 *   Robots: noindex is served via response headers on API routes so blob
 *   URLs that leak to crawlers are not indexed.
 *
 * Hard limit: MAX_IMAGE_MB env (default 10) caps accepted upload sizes.
 */
import { put, del } from '@vercel/blob';

export function getMaxImageBytes(): number {
  const raw = process.env.MAX_IMAGE_MB;
  const mb = raw ? Number(raw) : 10;
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new Error('MAX_IMAGE_MB must be a positive number');
  }
  return Math.floor(mb * 1024 * 1024);
}

/**
 * Upload a file to Vercel Blob with a random suffix (unguessable pathname).
 */
export async function uploadBlob(pathname: string, file: Blob | Buffer | ArrayBuffer) {
  return put(pathname, file, {
    access: 'public',
    addRandomSuffix: true,
  });
}

/** Delete one URL or an array of URLs/pathnames from Blob storage. */
export async function deleteBlob(urlOrPathnames: string | string[]) {
  return del(urlOrPathnames);
}
