import type { VercelRequest, VercelResponse } from '@vercel/node';
import idHandler from '../server/handlers/categories-id.js';

/** Flat router (via vercel.json rewrite /api/categories/:id -> /api/category?id=:id). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return idHandler(req, res);
}
