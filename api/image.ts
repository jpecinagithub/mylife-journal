import type { VercelRequest, VercelResponse } from '@vercel/node';
import uploadHandler from '../server/handlers/images-upload.js';
import idHandler from '../server/handlers/images-id.js';
import { queryParam } from '../server/lib/entry-dto.js';

/** Flat router for images. Rewrites (specific first):
 *  /api/images/upload -> /api/image?action=upload
 *  /api/images/:id    -> /api/image?id=:id */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (queryParam(req, 'action') === 'upload') return uploadHandler(req, res);
  return idHandler(req, res);
}
