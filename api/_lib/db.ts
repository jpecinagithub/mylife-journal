/**
 * MyLife Journal — Neon HTTP database client (node-only).
 *
 * Lazy singleton: getDb() throws a clear error if DATABASE_URL is missing,
 * so misconfiguration fails loudly instead of silently.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL env var is required. Set it to your Neon Postgres connection string.',
    );
  }
  const client = neon(url);
  cachedDb = drizzle(client, { schema });
  return cachedDb;
}

// Re-export tables so route handlers can `import { entries } from './_lib/db.js'`
export * from './schema.js';
