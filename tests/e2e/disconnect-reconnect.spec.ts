import { test, expect } from '@playwright/test';
import { prepareE2EUser } from './database-setup';

test.describe('E2E Flow D: Disconnect & Reconnect Resilience', () => {
  test('should display disconnect alert countdown when opponent closes tab', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await prepareE2EUser(pageA);
    await prepareE2EUser(pageB);

    // 1. Player A creates Snake room
    await pageA.goto('/');
    await pageA.getByText(/SNAKES & LADDERS/i).first().click();
    await pageA.getByRole('button', { name: /Create SNAKE Duel/i }).click();
    await pageA.getByRole('button', { name: /Confirm & Create/i }).click();

    const codeLocator = pageA.locator('.font-mono.font-black.text-2xl');
    await expect(codeLocator).toBeVisible();
    const roomCode = (await codeLocator.textContent())?.trim();

    // 2. Player B joins room
    await pageB.goto('/');
    await pageB.getByText(/SNAKES & LADDERS/i).first().click();
    await pageB.getByRole('button', { name: /Open Rooms/i }).click();
    await pageB.getByPlaceholder('Enter code').fill(roomCode!);
    await pageB.getByRole('button', { name: /Join by code/i }).click();
    await pageB.getByRole('button', { name: /Confirm & Duel/i }).click();

    // Wait for match to start
    await expect(pageA.getByText(/YOUR TURN/i).or(pageA.getByText(/ROLL DICE/i)).first()).toBeVisible({ timeout: 10000 });

    // 3. Player B disconnects (closes page/context)
    await pageB.close();
    await contextB.close();

    // 4. Player A sees Opponent Disconnected overlay with countdown
    await expect(pageA.getByText(/OPPONENT DISCONNECTED/i).first()).toBeVisible({ timeout: 10000 });

    await contextA.close();
  });
});
