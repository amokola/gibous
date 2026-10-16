import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { prepareE2EUser } from './database-setup';

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function newPlayer(browser: Browser, balance = 100): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await prepareE2EUser(page, balance);
  return page;
}

async function newMobilePlayer(browser: Browser, balance = 100): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(context);
  const page = await context.newPage();
  await prepareE2EUser(page, balance);
  return page;
}

async function openGame(page: Page, title: RegExp, balance = 100): Promise<void> {
  await page.goto('/');
  await expect(page.getByText(`${balance} GRAM`, { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByText(title).first().click();
  await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();
}

async function createRoom(page: Page, title: RegExp, gameCode: string): Promise<string> {
  await openGame(page, title);
  await page.getByRole('button', { name: new RegExp(`Create ${gameCode} Duel`, 'i') }).click();
  await page.getByRole('button', { name: /Confirm & Create/i }).click();
  await expect(page.getByText(/DUEL ROOM CODE/i)).toBeVisible();
  const code = (await page.locator('.font-mono.font-black.text-2xl').textContent())?.trim();
  expect(code).toBeTruthy();
  return code!;
}

async function joinRoom(page: Page, title: RegExp, roomCode: string): Promise<void> {
  await openGame(page, title);
  await page.getByRole('button', { name: /Open Rooms/i }).click();
  await page.getByPlaceholder('Enter code').fill(roomCode);
  await page.getByRole('button', { name: 'Join by code' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /Confirm & Duel/i }).click();
}

async function createPair(browser: Browser, title: RegExp, gameCode: string) {
  const [playerA, playerB] = await Promise.all([newPlayer(browser), newPlayer(browser)]);
  const roomCode = await createRoom(playerA, title, gameCode);
  await joinRoom(playerB, title, roomCode);
  return { playerA, playerB, roomCode };
}

async function createMobilePair(browser: Browser, title: RegExp, gameCode: string) {
  const [playerA, playerB] = await Promise.all([newMobilePlayer(browser), newMobilePlayer(browser)]);
  const roomCode = await createRoom(playerA, title, gameCode);
  await joinRoom(playerB, title, roomCode);
  return { playerA, playerB, roomCode };
}

async function readStoredBalance(page: Page): Promise<number> {
  const telegramId = await page.evaluate(() => window.sessionStorage.getItem('gibous_mock_tg_id'));
  const databaseUrl = process.env.E2E_DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (!telegramId || !databaseUrl) throw new Error('Test user or disposable database is unavailable');
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const result = await pool.query(
      'SELECT balance_gram::text AS balance FROM users WHERE telegram_id = $1',
      [telegramId],
    );
    if (!result.rowCount) throw new Error('Test user balance was not persisted');
    return Number(result.rows[0].balance);
  } finally {
    await pool.end();
  }
}

test.describe('Browser gameplay and boundary scenarios', () => {
  test.describe.configure({ timeout: 60_000 });

  test('rejects an unknown room code and lets the player correct it', async ({ browser }) => {
    const page = await newPlayer(browser);
    await openGame(page, /FOUR IN A ROW/i);
    await page.getByRole('button', { name: /Open Rooms/i }).click();

    const codeInput = page.getByPlaceholder('Enter code');
    await codeInput.fill(' missing123 ');
    await page.getByRole('button', { name: 'Join by code' }).click();
    await expect(page.getByRole('alert')).toContainText(/No open room found with code MISSING123/i);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await codeInput.fill('');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Open Rooms/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('clamps custom stake changes at the advertised minimum and maximum', async ({ browser }) => {
    const page = await newPlayer(browser);
    await openGame(page, /SNAKES & LADDERS/i);
    const stake = page.locator('input[type="number"]');
    const decrease = page.getByRole('button', { name: 'Decrease stake' });
    const increase = page.getByRole('button', { name: 'Increase stake' });

    await expect(stake).toHaveValue('0.5');
    await expect(decrease).toBeDisabled();
    await increase.click();
    await expect(stake).toHaveValue('1');
    await stake.fill('999999');
    await expect(stake).toHaveValue('10000');
    await expect(increase).toBeDisabled();
    await decrease.click();
    await expect(stake).toHaveValue('9999.5');
  });

  test('blocks a manually entered stake below the minimum before room confirmation', async ({ browser }) => {
    const page = await newPlayer(browser);
    await openGame(page, /FOUR IN A ROW/i);
    const stake = page.locator('input[type="number"]');
    await stake.fill('0.1');

    await expect(page.getByRole('alert')).toContainText(/Stake must be between 0\.5 and 10000 GRAM/i);
    await expect(stake).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: /Create CONNECT4 Duel/i })).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('filters rooms by game and accepts a lower-case room code', async ({ browser }) => {
    const playerA = await newPlayer(browser);
    const playerB = await newPlayer(browser);
    const roomCode = await createRoom(playerA, /ROCK PAPER SCISSORS/i, 'RPS');

    await openGame(playerB, /FOUR IN A ROW/i);
    await playerB.getByRole('button', { name: /Open Rooms/i }).click();
    await expect(playerB.getByText(roomCode)).toHaveCount(0);
    await playerB.getByRole('button', { name: 'Rock Paper Scissors rooms' }).click();
    await expect(playerB.getByText(roomCode)).toBeVisible();

    await playerB.getByPlaceholder('Enter code').fill(roomCode.toLowerCase());
    await playerB.getByRole('button', { name: 'Join by code' }).click();
    await expect(playerB.getByRole('dialog')).toContainText('Join Duel');
    await expect(playerB.getByRole('dialog')).toContainText('0.5 GRAM');
  });

  test('hands the Snake and Ladders turn to the opponent after a roll', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /SNAKES & LADDERS/i, 'SNAKE');
    const pawn = playerA.getByTestId('pawn-p1');
    const startingStyle = await pawn.getAttribute('style');
    const roll = playerA.getByRole('button', { name: 'ROLL DICE' });

    await expect(roll).toBeEnabled();
    await expect(playerB.getByRole('button', { name: /WAITING FOR OPPONENT/i })).toBeDisabled();
    await roll.click();
    await expect(playerB.getByRole('button', { name: 'ROLL DICE' })).toBeEnabled({ timeout: 10_000 });
    await expect(pawn).not.toHaveAttribute('style', startingStyle || '', { timeout: 10_000 });
    await expect(playerA.getByRole('button', { name: /WAITING FOR OPPONENT/i })).toBeDisabled();
  });

  test('keeps RPS choices hidden, reveals a tie, then accepts the next round', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    const playerARock = playerA.getByRole('button', { name: 'ROCK', exact: true });
    const playerBRock = playerB.getByRole('button', { name: 'ROCK', exact: true });

    await expect(playerA.getByText('CHOOSE YOUR WEAPON', { exact: true })).toBeVisible();
    await playerARock.click();
    await expect(playerA.getByText(/YOUR CHOICE: ROCK/i)).toBeVisible();
    await expect(playerB.locator('.rps-reveal-card')).toHaveCount(0);

    await playerBRock.click();
    await expect(playerA.getByText(/DOUBLE CLASH — DRAW/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerB.locator('.rps-reveal-card')).toHaveCount(2);
    await expect(playerARock).toBeEnabled({ timeout: 8_000 });
    await expect(playerB.getByRole('button', { name: 'SCISSORS', exact: true })).toBeEnabled();
  });

  test('plays a full Connect 4 win, blocks out-of-turn input, and disables moves after settlement', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    const column = (page: Page, number: number) => page.getByRole('button', { name: new RegExp(`column ${number}$`, 'i') });
    await expect(column(playerA, 1)).toBeEnabled();
    await expect(column(playerB, 1)).toBeDisabled();

    const moves: Array<[Page, number]> = [
      [playerA, 1], [playerB, 1],
      [playerA, 2], [playerB, 2],
      [playerA, 3], [playerB, 3],
      [playerA, 4],
    ];
    for (const [page, number] of moves) {
      const drop = column(page, number);
      await expect(drop).toBeEnabled();
      await drop.click();
    }

    await expect(playerA.getByRole('heading', { name: 'You Won The Match!' })).toBeVisible({ timeout: 10_000 });
    await expect(playerB.getByRole('heading', { name: /Won The Match/i })).toBeVisible();
    await expect(column(playerA, 5)).toHaveCount(0);
  });

  test('lets a player cancel the surrender dialog and continue their turn', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    await playerA.getByTitle('Leave duel').click();
    await expect(playerA.getByRole('dialog')).toContainText('SURRENDER DUEL?');
    await playerA.getByRole('button', { name: 'STAY & PLAY' }).click();
    await expect(playerA.getByRole('dialog')).toHaveCount(0);
    await expect(playerA.getByRole('button', { name: /column 1$/i })).toBeEnabled();
    await expect(playerB.getByRole('button', { name: /column 1$/i })).toBeDisabled();
    await playerA.getByRole('button', { name: /column 1$/i }).click();
    await expect(playerB.getByRole('button', { name: /column 2$/i })).toBeEnabled();
  });

  test('reconnects after a page reload and restores the current board position', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    await playerA.getByRole('button', { name: /column 3$/i }).click();
    await expect(playerA.getByTestId('connect4-board').locator('.c4-checker')).toHaveCount(1);

    await playerA.reload({ waitUntil: 'commit' });
    await expect(playerA.getByTestId('connect4-board').locator('.c4-checker')).toHaveCount(1, { timeout: 15_000 });
    await expect(playerA.getByRole('button', { name: /column 4$/i })).toBeDisabled({ timeout: 15_000 });
    await expect(playerB.getByRole('button', { name: /column 4$/i })).toBeEnabled({ timeout: 15_000 });
  });

  test('keeps the create-and-cancel flow usable on a narrow mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    contexts.push(context);
    const page = await context.newPage();
    await prepareE2EUser(page);
    const roomCode = await createRoom(page, /SNAKES & LADDERS/i, 'SNAKE');
    await expect(page.getByText(roomCode)).toBeVisible();
    await page.getByRole('button', { name: /CANCEL DUEL/i }).click();
    await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('cancels room creation without reserving a room or changing the selected game', async ({ browser }) => {
    const page = await newPlayer(browser);
    await openGame(page, /FOUR IN A ROW/i);
    await page.getByRole('button', { name: /Create CONNECT4 Duel/i }).click();
    await expect(page.getByRole('dialog')).toContainText('Confirm Duel Entry');
    await page.getByRole('button', { name: /Cancel/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/1\. Choose Game:/i)).toBeVisible();
    await expect(page.getByText(/Waiting for opponent/i)).toHaveCount(0);
  });

  test('cancels joining from the confirmation dialog and keeps the room available', async ({ browser }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);
    const roomCode = await createRoom(host, /FOUR IN A ROW/i, 'CONNECT4');
    await openGame(guest, /FOUR IN A ROW/i);
    await guest.getByRole('button', { name: /Open Rooms/i }).click();
    await guest.getByPlaceholder('Enter code').fill(roomCode);
    await guest.getByRole('button', { name: 'Join by code' }).click();
    await expect(guest.getByRole('dialog')).toBeVisible();
    await guest.getByRole('button', { name: /Cancel/i }).click();
    await expect(guest.getByRole('dialog')).toHaveCount(0);
    await expect(guest.getByText(roomCode)).toBeVisible();
    await expect(host.getByText(roomCode)).toBeVisible();
  });

  test('rejects a join when the player cannot cover the advertised stake', async ({ browser }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser, 0);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    await openGame(guest, /ROCK PAPER SCISSORS/i, 0);
    await guest.getByRole('button', { name: /Open Rooms/i }).click();
    await guest.getByPlaceholder('Enter code').fill(roomCode);
    await guest.getByRole('button', { name: 'Join by code' }).click();
    await expect(guest.getByRole('dialog')).toContainText('0.5 GRAM');
    await guest.getByRole('button', { name: /Confirm & Duel/i }).click();
    await expect(guest.getByRole('alert').filter({ hasText: /Insufficient balance/i })).toHaveCount(1, { timeout: 10_000 });
    await expect(guest.getByRole('alert').filter({ hasText: /Could not join this duel/i })).toHaveCount(0);
    await expect(guest.getByRole('dialog')).toHaveCount(0);
    await expect(host.getByText(/DUEL ROOM CODE/i)).toBeVisible();
    await expect(host.getByText(roomCode)).toBeVisible();
  });

  test('removes a matched room from the open room list for a third player', async ({ browser }) => {
    const [host, guest, observer] = await Promise.all([
      newPlayer(browser), newPlayer(browser), newPlayer(browser),
    ]);
    const roomCode = await createRoom(host, /FOUR IN A ROW/i, 'CONNECT4');
    await joinRoom(guest, /FOUR IN A ROW/i, roomCode);
    await openGame(observer, /FOUR IN A ROW/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await expect(observer.getByText(roomCode)).toHaveCount(0, { timeout: 10_000 });
  });

  test('filters the room list by stake minimum and maximum', async ({ browser }) => {
    const hostLow = await newPlayer(browser);
    const hostHigh = await newPlayer(browser);
    const observer = await newPlayer(browser);
    const lowCode = await createRoom(hostLow, /SNAKES & LADDERS/i, 'SNAKE');
    await openGame(hostHigh, /SNAKES & LADDERS/i);
    await hostHigh.locator('input[type="number"]').fill('1');
    await hostHigh.getByRole('button', { name: /Create SNAKE Duel/i }).click();
    await hostHigh.getByRole('button', { name: /Confirm & Create/i }).click();
    await expect(hostHigh.getByText(/DUEL ROOM CODE/i)).toBeVisible();
    const highCode = (await hostHigh.locator('.font-mono.font-black.text-2xl').textContent())?.trim();
    expect(highCode).toBeTruthy();

    await openGame(observer, /SNAKES & LADDERS/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await expect(observer.getByText(lowCode)).toBeVisible();
    await expect(observer.getByText(highCode!)).toBeVisible();
    await observer.getByLabel('Min GRAM').fill('1');
    await expect(observer.getByText(highCode!)).toBeVisible();
    await expect(observer.getByText(lowCode)).toHaveCount(0);
    await observer.getByLabel('Min GRAM').fill('');
    await observer.getByLabel('Max GRAM').fill('0.5');
    await expect(observer.getByText(lowCode)).toBeVisible();
    await expect(observer.getByText(highCode!)).toHaveCount(0);
  });

  test('searches open rooms by host name and clears a no-match result', async ({ browser }) => {
    const host = await newPlayer(browser);
    const observer = await newPlayer(browser);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    await openGame(observer, /ROCK PAPER SCISSORS/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await expect(observer.getByText(roomCode)).toBeVisible();
    const hostTelegramId = await host.evaluate(() => window.sessionStorage.getItem('gibous_mock_tg_id'));
    expect(hostTelegramId).toBeTruthy();
    const expectedHostName = `Player ${hostTelegramId!.slice(-4)}`;
    const roomCard = observer.getByRole('article').filter({ hasText: `Room code: ${roomCode}` });
    await expect(roomCard.getByRole('heading', { name: expectedHostName })).toBeVisible();
    await observer.getByLabel('Find a host').fill(expectedHostName);
    await expect(observer.getByText(roomCode)).toBeVisible();
    await observer.getByLabel('Find a host').fill('no-such-player');
    await expect(observer.getByText(roomCode)).toHaveCount(0);
    await expect(observer.getByText('No rooms match these filters')).toBeVisible();
    await observer.getByRole('button', { name: 'Clear filters' }).click();
    await expect(observer.getByText(roomCode)).toBeVisible();
  });

  test('lets a host cancel a waiting room and removes it from other players’ lists', async ({ browser }) => {
    const host = await newPlayer(browser);
    const observer = await newPlayer(browser);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    await openGame(observer, /ROCK PAPER SCISSORS/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await expect(observer.getByText(roomCode)).toBeVisible();
    await host.getByRole('button', { name: /CANCEL DUEL/i }).click();
    await expect(host.getByText(/Waiting for opponent/i)).toHaveCount(0);
    await expect(host.getByText(/1\. Choose Game:/i)).toBeVisible();
    await expect(observer.getByText(roomCode)).toHaveCount(0, { timeout: 10_000 });
  });

  test('opens and closes the lobby rules and payout disclosure', async ({ browser }) => {
    const page = await newPlayer(browser);
    await openGame(page, /SNAKES & LADDERS/i);
    await page.getByRole('button', { name: 'Rules' }).click();
    await expect(page.getByText('Gibous Fair Play & Match Economics')).toBeVisible();
    await expect(page.getByText(/Winner receives 90% of the pot/i)).toBeVisible();
    await page.getByRole('button', { name: 'Rules' }).click();
    await expect(page.getByText('Gibous Fair Play & Match Economics')).toHaveCount(0);
  });

  test('wins Connect 4 vertically and settles only after the fourth checker', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    const drop = (page: Page, column: number) => page.getByRole('button', { name: new RegExp(`column ${column}$`, 'i') });
    const moves: Array<[Page, number]> = [
      [playerA, 1], [playerB, 2], [playerA, 1], [playerB, 2],
      [playerA, 1], [playerB, 2], [playerA, 1],
    ];
    for (const [page, column] of moves) {
      await expect(drop(page, column)).toBeEnabled();
      await drop(page, column).click();
    }
    await expect(playerA.getByRole('heading', { name: 'You Won The Match!' })).toBeVisible({ timeout: 10_000 });
  });

  test('allows Connect 4 moves in both edge columns', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    await playerA.getByRole('button', { name: /column 1$/i }).click();
    await expect(playerB.getByRole('button', { name: /column 7$/i })).toBeEnabled();
    await playerB.getByRole('button', { name: /column 7$/i }).click();
    await expect(playerA.getByTestId('connect4-board').locator('.c4-checker')).toHaveCount(2);
    await expect(playerA.getByRole('button', { name: /column 1$/i })).toBeEnabled();
    await expect(playerA.getByRole('button', { name: /column 7$/i })).toBeEnabled();
  });

  test('keeps a full Connect 4 column unchanged when another drop is attempted', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    const moves: Array<[Page, Page]> = [
      [playerA, playerB], [playerA, playerB], [playerA, playerB],
    ];
    for (const [first, second] of moves) {
      await first.getByRole('button', { name: /column 1$/i }).click();
      await second.getByRole('button', { name: /column 1$/i }).click();
    }
    await expect(playerA.getByTestId('connect4-board').locator('.c4-checker')).toHaveCount(6);
    await playerA.getByRole('button', { name: /column 1$/i }).click();
    await expect(playerA.getByTestId('connect4-board').locator('.c4-checker')).toHaveCount(6);
    await expect(playerA.getByRole('alert')).toContainText('Column 1 is full', { timeout: 10_000 });
  });

  test('resolves a Rock Paper Scissors round when paper beats rock', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    await playerA.getByRole('button', { name: 'PAPER', exact: true }).click();
    await playerB.getByRole('button', { name: 'ROCK', exact: true }).click();
    await expect(playerA.getByText(/YOU WON THIS ROUND/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerB.getByText(/WON ROUND/i)).toBeVisible({ timeout: 10_000 });
  });

  test('resolves a Rock Paper Scissors round when scissors beats paper', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    await playerA.getByRole('button', { name: 'SCISSORS', exact: true }).click();
    await playerB.getByRole('button', { name: 'PAPER', exact: true }).click();
    await expect(playerA.getByText(/YOU WON THIS ROUND/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerB.getByText(/WON ROUND/i)).toBeVisible({ timeout: 10_000 });
  });

  test('locks a Rock Paper Scissors choice until both players have submitted', async ({ browser }) => {
    const { playerA, playerB } = await createPair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    const rock = playerA.getByRole('button', { name: 'ROCK', exact: true });
    await rock.click();
    await expect(rock).toBeDisabled();
    await expect(playerA.getByRole('button', { name: 'PAPER', exact: true })).toBeDisabled();
    await expect(playerA.getByText(/YOUR CHOICE: ROCK/i)).toBeVisible();
    await playerB.getByRole('button', { name: 'SCISSORS', exact: true }).click();
    await expect(playerA.getByText(/YOU WON THIS ROUND/i)).toBeVisible({ timeout: 10_000 });
  });

  test('returns from a game lobby home and can enter a different game lobby', async ({ browser }) => {
    const page = await newPlayer(browser);
    await openGame(page, /SNAKES & LADDERS/i);
    await page.getByRole('button', { name: 'Back to home' }).click();
    await expect(page.getByText('100 GRAM', { exact: true })).toBeVisible();
    await page.getByText(/ROCK PAPER SCISSORS/i).first().click();
    await expect(page.getByRole('button', { name: /Create RPS Duel/i })).toBeVisible();
  });

  test('mobile host cancellation refunds the full waiting-room stake', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const roomCode = await createRoom(host, /FOUR IN A ROW/i, 'CONNECT4');
    await expect(host.getByText(roomCode)).toBeVisible();
    await host.getByRole('button', { name: /CANCEL DUEL/i }).click();
    await expect.poll(() => readStoredBalance(host), { timeout: 10_000 }).toBe(100);
  });

  test('mobile room creation accepts a stake equal to the full balance and refund restores it', async ({ browser }) => {
    const host = await newMobilePlayer(browser, 0.5);
    await openGame(host, /SNAKES & LADDERS/i, 0.5);
    await host.getByRole('button', { name: /Create SNAKE Duel/i }).click();
    await expect(host.getByRole('dialog')).toContainText('0.5 GRAM');
    await host.getByRole('button', { name: /Confirm & Create/i }).click();
    await expect(host.getByText(/DUEL ROOM CODE/i)).toBeVisible();
    await host.getByRole('button', { name: /CANCEL DUEL/i }).click();
    await expect.poll(() => readStoredBalance(host), { timeout: 10_000 }).toBe(0.5);
  });

  test('mobile successful joining debits the host and guest stake once each', async ({ browser }) => {
    const { playerA, playerB } = await createMobilePair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    await expect.poll(() => readStoredBalance(playerA), { timeout: 10_000 }).toBe(99.5);
    await expect.poll(() => readStoredBalance(playerB), { timeout: 10_000 }).toBe(99.5);
  });

  test('mobile refresh restores the host waiting-room invitation and cancel action', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    await host.reload({ waitUntil: 'commit' });
    await expect(host.getByText(/DUEL ROOM CODE/i)).toBeVisible({ timeout: 15_000 });
    await expect(host.getByText(roomCode)).toBeVisible();
    await expect(host.getByRole('button', { name: /CANCEL DUEL/i })).toBeEnabled();
  });

  test('mobile guest cannot use a room code after its host cancels the room', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const guest = await newMobilePlayer(browser);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    await host.getByRole('button', { name: /CANCEL DUEL/i }).click();
    await openGame(guest, /ROCK PAPER SCISSORS/i);
    await guest.getByRole('button', { name: /Open Rooms/i }).click();
    await guest.getByPlaceholder('Enter code').fill(roomCode);
    await guest.getByRole('button', { name: 'Join by code' }).click();
    await expect(guest.getByRole('alert')).toContainText(/No open room found with code/i);
    await expect(guest.getByRole('dialog')).toHaveCount(0);
  });

  test('mobile room stake filters include exact minimum and maximum boundaries', async ({ browser }) => {
    const lowHost = await newMobilePlayer(browser);
    const highHost = await newMobilePlayer(browser);
    const observer = await newMobilePlayer(browser);
    const lowCode = await createRoom(lowHost, /SNAKES & LADDERS/i, 'SNAKE');
    await openGame(highHost, /SNAKES & LADDERS/i);
    await highHost.locator('input[type="number"]').fill('1');
    await highHost.getByRole('button', { name: /Create SNAKE Duel/i }).click();
    await highHost.getByRole('button', { name: /Confirm & Create/i }).click();
    await expect(highHost.getByText(/DUEL ROOM CODE/i)).toBeVisible();
    const highCode = (await highHost.locator('.font-mono.font-black.text-2xl').textContent())?.trim();
    expect(highCode).toBeTruthy();

    await openGame(observer, /SNAKES & LADDERS/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await observer.getByLabel('Min GRAM').fill('0.5');
    await observer.getByLabel('Max GRAM').fill('0.5');
    await expect(observer.getByText(lowCode)).toBeVisible();
    await expect(observer.getByText(highCode!)).toHaveCount(0);
    await observer.getByLabel('Min GRAM').fill('1');
    await observer.getByLabel('Max GRAM').fill('1');
    await expect(observer.getByText(highCode!)).toBeVisible();
    await expect(observer.getByText(lowCode)).toHaveCount(0);
  });

  test('mobile stake filter rejects a reversed range and recovers when cleared', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const observer = await newMobilePlayer(browser);
    const roomCode = await createRoom(host, /FOUR IN A ROW/i, 'CONNECT4');
    await openGame(observer, /FOUR IN A ROW/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await observer.getByLabel('Min GRAM').fill('1');
    await observer.getByLabel('Max GRAM').fill('0.5');
    await expect(observer.getByText('Minimum must be less than or equal to maximum.')).toBeVisible();
    await expect(observer.getByText(roomCode)).toHaveCount(0);
    await observer.getByRole('button', { name: 'Clear filters' }).click();
    await expect(observer.getByText(roomCode)).toBeVisible();
    const overflow = await observer.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('mobile host search is case-insensitive and returns the matching room', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const observer = await newMobilePlayer(browser);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    const hostId = await host.evaluate(() => window.sessionStorage.getItem('gibous_mock_tg_id'));
    expect(hostId).toBeTruthy();
    const hostName = `Player ${hostId!.slice(-4)}`;
    await openGame(observer, /ROCK PAPER SCISSORS/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await observer.getByLabel('Find a host').fill(hostName.toLowerCase());
    const roomCard = observer.getByRole('article').filter({ hasText: `Room code: ${roomCode}` });
    await expect(roomCard.getByRole('heading', { name: hostName })).toBeVisible();
    await observer.getByLabel('Find a host').fill(hostName.toUpperCase());
    await expect(roomCard).toBeVisible();
  });

  test('mobile quick-join by code switches from the selected game to the room game', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const guest = await newMobilePlayer(browser);
    const roomCode = await createRoom(host, /ROCK PAPER SCISSORS/i, 'RPS');
    await openGame(guest, /SNAKES & LADDERS/i);
    await guest.getByRole('button', { name: /Open Rooms/i }).click();
    await guest.getByPlaceholder('Enter code').fill(roomCode);
    await guest.getByRole('button', { name: 'Join by code' }).click();
    await expect(guest.getByRole('dialog')).toContainText('Rock Paper Scissors');
    await guest.getByRole('button', { name: /Confirm & Duel/i }).click();
    await expect(guest.getByRole('button', { name: 'ROCK', exact: true })).toBeVisible();
  });

  test('mobile open-room browsing and filters do not create horizontal overflow', async ({ browser }) => {
    const host = await newMobilePlayer(browser);
    const observer = await newMobilePlayer(browser);
    await createRoom(host, /SNAKES & LADDERS/i, 'SNAKE');
    await openGame(observer, /SNAKES & LADDERS/i);
    await observer.getByRole('button', { name: /Open Rooms/i }).click();
    await observer.getByLabel('Find a host').fill('player');
    const overflow = await observer.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('mobile Rock Paper Scissors tie advances the round without scoring', async ({ browser }) => {
    const { playerA, playerB } = await createMobilePair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    await playerA.getByRole('button', { name: 'ROCK', exact: true }).click();
    await playerB.getByRole('button', { name: 'ROCK', exact: true }).click();
    await expect(playerA.getByText(/DOUBLE CLASH — DRAW/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerA.getByText(/ROUND 2 • FIRST TO 3 GEMS/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerA.locator('.tracking-widest.text-base')).toHaveText(['○○○', '○○○']);
    await expect(playerA.getByTitle('Round 1: rock vs rock')).toContainText('D');
  });

  test('mobile RPS correctly displays the player-two winning perspective', async ({ browser }) => {
    const { playerA, playerB } = await createMobilePair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    await playerA.getByRole('button', { name: 'ROCK', exact: true }).click();
    await playerB.getByRole('button', { name: 'PAPER', exact: true }).click();
    await expect(playerA.getByText(/WON ROUND/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerB.getByText('YOU WON THIS ROUND', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(playerB.locator('.tracking-widest.text-base').last()).toHaveText('●○○');
  });

  test('mobile Rock Paper Scissors settles a best-of-three match and locks further choices', async ({ browser }) => {
    const { playerA, playerB } = await createMobilePair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    for (let round = 0; round < 3; round += 1) {
      await playerA.getByRole('button', { name: 'ROCK', exact: true }).click();
      await playerB.getByRole('button', { name: 'SCISSORS', exact: true }).click();
      if (round < 2) {
        await expect(playerA.getByText('YOU WON THIS ROUND', { exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(playerA.getByRole('button', { name: 'ROCK', exact: true })).toBeEnabled({ timeout: 10_000 });
      }
    }
    await expect(playerA.getByText(/YOU WON THE MATCH/i)).toBeVisible({ timeout: 10_000 });
    await expect(playerA.locator('.tracking-widest.text-base').first()).toHaveText('●●●');
    await expect(playerA.getByRole('button', { name: 'ROCK', exact: true })).toBeDisabled();
  });

  test('mobile RPS keeps a committed hidden choice locked after a page reload', async ({ browser }) => {
    const { playerA, playerB } = await createMobilePair(browser, /ROCK PAPER SCISSORS/i, 'RPS');
    await playerA.getByRole('button', { name: 'PAPER', exact: true }).click();
    await playerA.reload({ waitUntil: 'commit' });
    await expect(playerA.getByRole('button', { name: 'ROCK', exact: true })).toBeDisabled({ timeout: 15_000 });
    await expect(playerA.getByRole('button', { name: 'PAPER', exact: true })).toBeDisabled();
    await playerB.getByRole('button', { name: 'ROCK', exact: true }).click();
    await expect(playerA.getByText('YOU WON THIS ROUND', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('mobile touch controls complete a diagonal Connect 4 win without overflow', async ({ browser }) => {
    const { playerA, playerB } = await createMobilePair(browser, /FOUR IN A ROW/i, 'CONNECT4');
    const overflow = await playerA.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    const moves: Array<[Page, number]> = [
      [playerA, 1], [playerB, 2],
      [playerA, 2], [playerB, 3],
      [playerA, 3], [playerB, 7],
      [playerA, 3], [playerB, 4],
      [playerA, 4], [playerB, 4],
      [playerA, 4],
    ];
    for (const [page, column] of moves) {
      const control = page.getByRole('button', { name: new RegExp(`column ${column}$`, 'i') });
      await expect(control).toBeEnabled();
      await control.tap();
    }
    await expect(playerA.getByText(/YOU WON THE MATCH/i)).toBeVisible({ timeout: 10_000 });
  });
});
