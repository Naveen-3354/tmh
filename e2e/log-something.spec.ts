import { expect, test } from '@playwright/test';

/**
 * The happy path that matters: sign in and log something.
 *
 * This is the one flow the product cannot afford to break — logging friction
 * is the stated reason health apps get abandoned (RESEARCH.md D1), so the test
 * asserts the *two-tap* claim rather than merely that a write succeeds.
 *
 * Runs against the demo account, which the seed script creates. It needs a
 * running app and a seeded database; `npm run test:e2e` starts the dev server
 * for you.
 */

test.describe('log something', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /explore the demo account/i }).click();
    await expect(page).toHaveURL(/\/today/);
  });

  test('logs water in two taps and updates the dashboard', async ({ page }) => {
    const waterTotal = page.getByRole('definition').filter({ hasText: /ml of/ }).first();
    const before = await waterTotal.innerText();
    const beforeMl = Number(before.replace(/,/g, '').match(/(\d+)\s*ml/)?.[1] ?? '0');

    // Tap one: open the sheet from the persistent quick-add bar.
    await page
      .getByRole('navigation', { name: 'Quick add' })
      .getByRole('button', { name: 'Water' })
      .click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // Tap two: choose a preset. That completes the log — no confirm step.
    await sheet.getByRole('button', { name: /glass/i }).click();

    await expect(page.getByRole('status')).toContainText(/logged 250 ml/i);
    await expect(sheet).toBeHidden();

    await expect
      .poll(
        async () => {
          const text = await waterTotal.innerText();
          return Number(text.replace(/,/g, '').match(/(\d+)\s*ml/)?.[1] ?? '0');
        },
        { timeout: 15_000 },
      )
      .toBe(beforeMl + 250);
  });

  test('offers undo, and undo actually removes the entry', async ({ page }) => {
    const waterTotal = page.getByRole('definition').filter({ hasText: /ml of/ }).first();
    const beforeMl = Number(
      (await waterTotal.innerText()).replace(/,/g, '').match(/(\d+)\s*ml/)?.[1] ?? '0',
    );

    await page
      .getByRole('navigation', { name: 'Quick add' })
      .getByRole('button', { name: 'Water' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /bottle/i })
      .click();

    const toast = page.getByRole('status');
    await expect(toast).toContainText(/logged 500 ml/i);

    await toast.getByRole('button', { name: /undo/i }).click();

    // Back where we started, not merely "a toast disappeared".
    await expect
      .poll(
        async () => {
          const text = await waterTotal.innerText();
          return Number(text.replace(/,/g, '').match(/(\d+)\s*ml/)?.[1] ?? '0');
        },
        { timeout: 15_000 },
      )
      .toBe(beforeMl);
  });

  test('logs mood in two taps', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Quick add' })
      .getByRole('button', { name: 'Mood' })
      .click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // Exact, or this also matches "Very good".
    await sheet.getByRole('button', { name: 'Good', exact: true }).click();

    await expect(page.getByRole('status')).toContainText(/logged mood: good/i);
  });

  test('search returns verified nutrition data', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Quick add' })
      .getByRole('button', { name: 'Food' })
      .click();

    const sheet = page.getByRole('dialog');
    await sheet.getByLabel(/search foods/i).fill('banana');

    // Provenance is shown on every row — the answer to the "wrong data"
    // complaint in RESEARCH.md D2.
    await expect(sheet.getByText('Verified').first()).toBeVisible({ timeout: 20_000 });
  });

  test('the dashboard is reachable and readable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Quick add' })).toBeVisible();

    // Nothing may overflow horizontally on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
