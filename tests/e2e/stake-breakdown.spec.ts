import { test, expect } from '@playwright/test';
import { prepareE2EUser } from './database-setup';

test.describe('E2E Flow E: Stake Breakdown', () => {
  test('should verify stake breakdown math is displayed before match entry', async ({ page }) => {
    await prepareE2EUser(page);
    await page.goto('/');
    await page.getByText(/FOUR IN A ROW/i).first().click();

    // Select the largest advertised preset supported by the current UI.
    await page.getByRole('button', { name: '10', exact: true }).click();

    // 10 GRAM per player yields a 20 GRAM pot, 18 net win, 2 fee, and 9.5 draw refund.
    await expect(page.getByText(/20\s*GRAM/i)).toBeVisible();
    await expect(page.getByText(/\+18\s*GRAM/i)).toBeVisible();
    await expect(page.getByText(/-2\s*GRAM/i)).toBeVisible();
    await expect(page.getByText(/\+9\.5\s*GRAM/i)).toBeVisible();
  });

  test('rejects room creation when the account balance is below the selected stake', async ({ page }) => {
    await prepareE2EUser(page, 0.25);
    await page.goto('/');
    await page.getByText(/FOUR IN A ROW/i).first().click();

    await page.getByRole('button', { name: /Create CONNECT4 Duel/i }).click();
    await page.getByRole('button', { name: /Confirm & Create/i }).click();

    await expect(page.getByRole('alert').filter({ hasText: /Insufficient balance/i }).first()).toBeVisible();
    await expect(page.getByText(/DUEL ROOM CODE/i)).toHaveCount(0);
    await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();
  });
});
