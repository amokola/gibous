import { test, expect } from '@playwright/test';

test.describe('E2E Flow A: Create Duel Journey', () => {
  test('should navigate from Home -> Lobby -> Select Game & Stake -> Create Duel -> Waiting Room -> Cancel', async ({ page }) => {
    // 1. Open App Home Screen
    await page.goto('/');

    // Verify Home Screen loaded
    await expect(page.getByText(/GIBOUS/i).first()).toBeVisible();

    // 2. Select Snake & Ladders Game Card
    const snakeCard = page.getByText(/SNAKES & LADDERS/i).first();
    await snakeCard.click();

    // 3. Lobby Screen loads with Create Duel tab
    await expect(page.getByText(/Create Duel/i)).toBeVisible();
    await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();

    // 4. Select Stake Preset (e.g. 250)
    const preset250 = page.getByRole('button', { name: '250', exact: true });
    await preset250.click();

    // 5. Click Create Duel CTA
    const createBtn = page.getByRole('button', { name: /Create SNAKE Duel/i });
    await createBtn.click();

    // 6. Confirm in Stake Modal
    const confirmBtn = page.getByRole('button', { name: /Confirm & Create/i });
    await confirmBtn.click();

    // 7. Waiting Room Screen appears with room code
    await expect(page.getByText(/DUEL ROOM CODE/i)).toBeVisible();
    await expect(page.getByText(/WAITING\.\.\./i)).toBeVisible();

    // 8. Cancel Duel and return to Lobby
    const cancelBtn = page.getByRole('button', { name: /CANCEL DUEL/i });
    await cancelBtn.click();

    await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();
  });
});
