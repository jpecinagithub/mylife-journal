import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './api/_lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
