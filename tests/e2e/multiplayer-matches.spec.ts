import { test, expect } from '@playwright/test';

test.describe('E2E Flow B: 2-Player Real Multiplayer Match Flow', () => {
  test('should match Player A and Player B in a real Connect 4 duel', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 1. Player A opens app and creates Connect 4 room
    await pageA.goto('/');
    await pageA.getByText(/FOUR IN A ROW/i).first().click();

    const createBtnA = pageA.getByRole('button', { name: /Create CONNECT4 Duel/i });
    await createBtnA.click();
    await pageA.getByRole('button', { name: /Confirm & Create/i }).click();

    // Player A sees room code
    await expect(pageA.getByText(/DUEL ROOM CODE/i)).toBeVisible();
    const codeLocator = pageA.locator('.font-mono.font-black.text-2xl');
    await expect(codeLocator).toBeVisible();
    const roomCode = (await codeLocator.textContent())?.trim();
    expect(roomCode).toBeTruthy();

    // 2. Player B opens app and joins room by code
    await pageB.goto('/');
    await pageB.getByText(/FOUR IN A ROW/i).first().click();

    // Switch to Open Rooms or enter code
    const openRoomsTabB = pageB.getByRole('button', { name: /Open Rooms/i });
    await openRoomsTabB.click();

    const codeInputB = pageB.getByPlaceholder(/Enter 6-char Room Code/i);
    await codeInputB.fill(roomCode!);
    await pageB.getByRole('button', { name: /Join Code/i }).click();

    // Player B confirms join in modal
    const confirmJoinBtn = pageB.getByRole('button', { name: /Confirm & Duel/i });
    await confirmJoinBtn.click();

    // 3. Both see VS Intro or Game Arena
    await expect(pageA.getByText(/MATCH POT/i).or(pageA.getByText(/YOUR TURN/i))).toBeVisible({ timeout: 10000 });
    await expect(pageB.getByText(/MATCH POT/i).or(pageB.getByText(/TURN/i))).toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });
});
