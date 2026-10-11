/**
 * MyLife Journal — JSON response helpers (node-only, Vercel serverless).
 *
 * Conventions:
 *   ok(res, data, status = 200)  -> { "data": data }
 *   err(res, status, code, message, details?) -> { "error": { code, message, details } }
 */
import type { VercelResponse } from '@vercel/node';

/** Private journal: never let API responses (which may embed blob URLs) be indexed. */
function noIndex(res: VercelResponse): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

export function ok<T>(res: VercelResponse, data: T, status = 200): void {
  noIndex(res);
  res.status(status).json({ data });
}

export function err(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  noIndex(res);
  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  err(res, 405, 'METHOD_NOT_ALLOWED', `Allowed methods: ${allowed.join(', ')}`);
}
