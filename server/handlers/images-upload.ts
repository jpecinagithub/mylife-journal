import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { checkCsrf, requireAuth } from '../lib/auth.js';
import { uploadBlob, getMaxImageBytes } from '../lib/blob.js';
import { imageUploadSchema, type ImageUploadInput } from '../lib/validate.js';
import { err, ok, methodNotAllowed } from '../lib/respond.js';

/**
 * POST /api/images/upload — JSON + base64 body (NOT multipart, avoids parser deps).
 *
 * Body: { fileName, contentType, data (base64), thumbnail?: { contentType, data } }
 * Validates contentType whitelist + magic bytes, caps decoded size at
 * MAX_IMAGE_MB, uploads with a 128-bit random pathname (addRandomSuffix),
 * stores nothing in the DB — the caller keeps {pathname, url}.
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

type ContentType = ImageUploadInput['contentType'];

function extFor(ct: ContentType): string {
  return ct === 'image/jpeg' ? 'jpg' : ct === 'image/png' ? 'png' : 'webp';
}

function decodeBase64(data: string): Buffer {
  return Buffer.from(data, 'base64');
}

/** Verify the first bytes match the declared image type (magic bytes). */
function checkMagicBytes(buf: Buffer, contentType: ContentType): boolean {
  if (contentType === 'image/jpeg') {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return (
      buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    );
  }
  // WebP: RIFF....WEBP
  return (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!checkCsrf(req, res)) return;
  if (!requireAuth(req, res)) return;

  const parsed = imageUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return err(res, 400, 'bad_request', 'Invalid request body', parsed.error.issues);
  }
  const b = parsed.data;

  let maxBytes: number;
  try {
    maxBytes = getMaxImageBytes();
  } catch {
    return err(res, 500, 'misconfigured', 'Invalid MAX_IMAGE_MB configuration');
  }

  const main = decodeBase64(b.data);
  const thumb = b.thumbnail ? decodeBase64(b.thumbnail.data) : null;
  const totalBytes = main.length + (thumb?.length ?? 0);
  if (totalBytes === 0 || totalBytes > maxBytes) {
    return err(
      res,
      413,
      'payload_too_large',
      `Decoded image bytes exceed the ${Math.floor(maxBytes / 1024 / 1024)} MB limit`,
    );
  }
  if (!checkMagicBytes(main, b.contentType)) {
    return err(res, 400, 'bad_request', 'File content does not match the declared image type');
  }
  if (thumb && b.thumbnail && !checkMagicBytes(thumb, b.thumbnail.contentType)) {
    return err(res, 400, 'bad_request', 'Thumbnail content does not match the declared image type');
  }

  try {
    const dir = `entries/${randomUUID()}`;
    const mainRes = await uploadBlob(`${dir}/img.${extFor(b.contentType)}`, main);
    let thumbRes: { pathname: string; url: string } | null = null;
    if (thumb && b.thumbnail) {
      const r = await uploadBlob(`${dir}/thumb.${extFor(b.thumbnail.contentType)}`, thumb);
      thumbRes = { pathname: r.pathname, url: r.url };
    }
    return ok(
      res,
      {
        pathname: mainRes.pathname,
        url: mainRes.url,
        thumbnailPathname: thumbRes?.pathname ?? null,
        thumbnailUrl: thumbRes?.url ?? null,
      },
      201,
    );
  } catch (e) {
    console.error('POST /api/images/upload failed', e);
    return err(res, 500, 'server_error', 'Failed to upload image');
  }
}
