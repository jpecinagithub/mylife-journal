/**
 * MyLife Journal — Playwright e2e config.
 *
 * The e2e suite only runs against a REAL DB-backed environment. There is no
 * webServer here on purpose: point it at a deployment or a manually started
 * dev server, e.g.:
 *
 *   MYLIFE_E2E_URL=http://localhost:5173 MYLIFE_E2E_PASSWORD=... npx playwright test
 *
 * Without MYLIFE_E2E_URL and MYLIFE_E2E_PASSWORD every spec self-skips, so the
 * default path (`npx playwright test` with no env) stays green without
 * launching any browser.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.MYLIFE_E2E_URL ?? 'http://localhost:5173',
  },
  // No webServer: see the header comment for how to run against a live env.
});
