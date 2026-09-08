import { test, expect } from '@playwright/test';

test.describe('E2E Flow E: Stake & Balance Verification', () => {
  test('should verify stake breakdown math is displayed before match entry', async ({ page }) => {
    await page.goto('/');
    await page.getByText(/FOUR IN A ROW/i).first().click();

    // Select custom 500 stake
    const preset500 = page.getByRole('button', { name: '500', exact: true });
    await preset500.click();

    // Verify economic breakdown card updates: 500 * 2 = 1000 Total Match Pot
    await expect(page.getByText(/1000\s*GRAM/i)).toBeVisible();
    await expect(page.getByText(/\+900\s*GRAM/i)).toBeVisible(); // Winner net
    await expect(page.getByText(/-100\s*GRAM/i)).toBeVisible(); // Arena fee
    await expect(page.getByText(/\+475\s*GRAM/i)).toBeVisible(); // Draw refund
  });
});
