import { test, expect } from '@playwright/test';
import { prepareE2EUser } from './database-setup';

test.describe('E2E Flow C: Resign / Surrender Flow', () => {
  test('should allow active player to surrender match and award victory to opponent', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await prepareE2EUser(pageA);
    await prepareE2EUser(pageB);

    // 1. Player A creates room
    await pageA.goto('/');
    await pageA.getByText(/ROCK PAPER SCISSORS/i).first().click();

    await pageA.getByRole('button', { name: /Create RPS Duel/i }).click();
    await pageA.getByRole('button', { name: /Confirm & Create/i }).click();

    const codeLocator = pageA.locator('.font-mono.font-black.text-2xl');
    await expect(codeLocator).toBeVisible();
    const roomCode = (await codeLocator.textContent())?.trim();

    // 2. Player B joins room
    await pageB.goto('/');
    await pageB.getByText(/ROCK PAPER SCISSORS/i).first().click();
    await pageB.getByRole('button', { name: /Open Rooms/i }).click();

    await pageB.getByPlaceholder('Enter code').fill(roomCode!);
    await pageB.getByRole('button', { name: /Join by code/i }).click();
    await pageB.getByRole('button', { name: /Confirm & Duel/i }).click();

    // 3. Both enter game arena
    await expect(pageA.getByText(/CHOOSE YOUR WEAPON/i).or(pageA.getByText(/ROUND 1/i)).first()).toBeVisible({ timeout: 10000 });
    await expect(pageB.getByText(/CHOOSE YOUR WEAPON/i).or(pageB.getByText(/ROUND 1/i)).first()).toBeVisible({ timeout: 10000 });

    // 4. Player A opens surrender modal and confirms
    const backBtnA = pageA.getByTitle(/Leave duel/i);
    await backBtnA.click();

    await expect(pageA.getByText(/SURRENDER DUEL\?/i)).toBeVisible();
    const forfeitBtnA = pageA.getByRole('button', { name: /FORFEIT/i });
    await forfeitBtnA.click();

    // 5. Both players receive a clear, settled result screen.
    await expect(pageA.getByRole('heading', { name: /You Forfeited The Match/i })).toBeVisible({ timeout: 10000 });
    await expect(pageA.getByText(/Your stake went to the winner/i)).toBeVisible();
    await expect(pageB.getByRole('heading', { name: /Opponent Forfeited! You Won!/i })).toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });
});
