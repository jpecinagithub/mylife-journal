/**
 * MyLife Journal — e2e smoke spec.
 *
 * Requires a real DB-backed environment:
 *   MYLIFE_E2E_URL=http://localhost:5173 MYLIFE_E2E_PASSWORD=... npx playwright test
 *
 * Without both env vars the whole file self-skips (green by default).
 *
 * NOTE (frontend wave in progress): selectors below are written against the
 * assumed UI (routes /, /login, /calendar; password field labelled
 * "Password"; login button "Log in"). Verify/adjust against the real frontend
 * once it lands — the flow (redirect -> wrong-password error -> login ->
 * create entry -> appears in calendar) is what matters.
 */
import { test, expect } from '@playwright/test';

const E2E_URL = process.env.MYLIFE_E2E_URL;
const E2E_PASSWORD = process.env.MYLIFE_E2E_PASSWORD;
const enabled = Boolean(E2E_URL && E2E_PASSWORD);

test.describe('smoke', () => {
  test.skip(
    !enabled,
    'E2E disabled: set MYLIFE_E2E_URL and MYLIFE_E2E_PASSWORD to run against a real env.',
  );

  test('unauthenticated / redirects to /login and renders the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });

  test('wrong password shows an error and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/password/i).fill('definitely-wrong-password');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    // error surfaced as an alert, error text, or invalid field state
    const errorVisible = await Promise.race([
      page
        .getByRole('alert')
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true),
      page
        .getByText(/incorrect|invalid|wrong|error/i)
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true),
    ]).catch(() => false);
    expect(errorVisible).toBe(true);
  });

  test('authenticated flow: login -> create entry -> appears in calendar', async ({ page }) => {
    const title = `E2E smoke ${Date.now()}`;

    // login
    await page.goto('/login');
    await page.getByLabel(/password/i).fill(E2E_PASSWORD as string);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // create entry (assumed "New entry" affordance + title field; adjust to real UI)
    await page.getByRole('button', { name: /new entry/i }).click();
    await page.getByLabel(/title/i).fill(title);
    await page.getByRole('button', { name: /save/i }).click();

    // appears in calendar
    await page.goto('/calendar');
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 });
  });
});
