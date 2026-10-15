import { test, expect } from '@playwright/test';
import { prepareE2EUser } from './database-setup';

test.describe('E2E Flow A: Create Duel Journey', () => {
  test('should navigate from Home -> Lobby -> Select Game & Stake -> Create Duel -> Waiting Room -> Cancel', async ({ page }) => {
    await prepareE2EUser(page);
    let lobbyModuleRequested = false;
    await page.route('**/src/components/lobby/LobbyScreen.tsx*', async (route) => {
      lobbyModuleRequested = true;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    // 1. Open App Home Screen
    await page.goto('/');

    // Verify Home Screen loaded
    await expect(page.getByText(/GIBOUS/i).first()).toBeVisible();
    expect(lobbyModuleRequested).toBe(true);

    // 2. Select Snake & Ladders Game Card
    const snakeCard = page.getByText(/SNAKES & LADDERS/i).first();
    await snakeCard.click();

    // The Lobby source was delayed during Home loading, so navigation must be synchronous now.
    await expect(page.getByText(/Create Duel/i)).toBeVisible();
    await expect(page.getByText('Loading arena…')).toHaveCount(0);

    // 3. Lobby Screen loads with Create Duel tab
    await expect(page.getByText(/Create Duel/i)).toBeVisible();
    await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();

    // 4. Select the smallest supported stake to keep the test account funded.
    await page.getByRole('button', { name: '0.5', exact: true }).click();

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
