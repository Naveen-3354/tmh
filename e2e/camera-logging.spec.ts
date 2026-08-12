import { expect, test } from '@playwright/test';

/**
 * Camera-based food logging.
 *
 * A headless browser has no camera, which makes this a genuinely useful test
 * rather than a contrived one: it exercises the exact path a user hits when
 * permission is denied — fall back to typing the barcode — and proves the
 * lookup, review and log steps all work from there.
 *
 * It also guards the sheet-to-sheet handoff. Closing the food sheet to open
 * the camera sheet fires a native `close` event on the first dialog, which
 * previously cleared the state that had just opened the second one.
 */

const NUTELLA = '3017620422003';

test.describe('camera food logging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /explore the demo account/i }).click();
    await expect(page).toHaveURL(/\/today/);
  });

  test('falls back to manual entry, then looks up and logs a real product', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Quick add' })
      .getByRole('button', { name: 'Food' })
      .click();

    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /scan a barcode/i }).click();

    // The handoff must survive the first dialog closing.
    await expect(sheet).toBeVisible();

    // No camera in headless, so the manual path should be offered.
    const barcodeInput = sheet.getByLabel(/barcode number/i);
    await expect(barcodeInput).toBeVisible({ timeout: 15_000 });

    await barcodeInput.fill(NUTELLA);
    await sheet.getByRole('button', { name: /look up/i }).click();

    // Real product, real numbers, and the source is shown.
    await expect(sheet.getByText(/open food facts/i)).toBeVisible({ timeout: 30_000 });

    await sheet.getByRole('button', { name: /^log 1 item$/i }).click();
    await expect(page.getByRole('status')).toContainText(/nutella/i, { timeout: 20_000 });

    // And it can be taken straight back out again.
    await page.getByRole('status').getByRole('button', { name: /undo/i }).click();
  });

  test('reports an unknown barcode instead of logging nothing silently', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Quick add' })
      .getByRole('button', { name: 'Food' })
      .click();

    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /scan a barcode/i }).click();

    const barcodeInput = sheet.getByLabel(/barcode number/i);
    await expect(barcodeInput).toBeVisible({ timeout: 15_000 });

    await barcodeInput.fill('0000000000000');
    await sheet.getByRole('button', { name: /look up/i }).click();

    await expect(sheet.getByText(/no product found/i)).toBeVisible({ timeout: 30_000 });
  });
});
