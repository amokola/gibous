import { test, expect } from '@playwright/test';

test.describe('E2E Flow C: Resign / Surrender Flow', () => {
  test('should allow active player to surrender match and award victory to opponent', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

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

    await pageB.getByPlaceholder(/Enter 6-char Room Code/i).fill(roomCode!);
    await pageB.getByRole('button', { name: /Join Code/i }).click();
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

    // 5. Player B receives Opponent Forfeited victory screen!
    await expect(pageB.getByText(/Opponent Forfeited/i).or(pageB.getByText(/FORFEIT WIN/i))).toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });
});
