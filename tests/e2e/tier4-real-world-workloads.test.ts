import { describe, it, expect, beforeAll } from 'vitest';
import { ensureE2EServer, createAuthClient, generateRoomCode, E2EClient, getE2EUserBalance, setupE2EUser } from './e2e-harness';

describe('Tier 4: Real-World Workloads E2E Test Suite', () => {
  let wsUrl: string;

  beforeAll(async () => {
    wsUrl = await ensureE2EServer();
  });

  // =========================================================================
  // WORKLOAD 1: Full Connect 4 Match -> Victory -> Rematch -> Continuation
  // =========================================================================
  it('4.1 should execute a complete real-world Connect 4 match from lobby discovery to rematch', async () => {
    const p1TgId = 401001;
    const p2TgId = 401002;
    await setupE2EUser(p1TgId, 'Alice_C4', 10000);
    await setupE2EUser(p2TgId, 'Bob_C4', 10000);

    const alice = await createAuthClient(p1TgId, 'Alice_C4');
    const bob = await createAuthClient(p2TgId, 'Bob_C4');
    const roomCode = generateRoomCode('C4FULL');

    // 1. Alice creates a 200 GRAM duel
    const createRes = await alice.sendAndAwait(
      { type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 200 } },
      'ROOM_CREATED'
    );
    expect(createRes.payload.code).toBe(roomCode);
    expect(createRes.payload.status).toBe('waiting');

    // 2. Bob browses lobby via GET_ROOMS and discovers Alice's room
    const roomsList = await bob.sendAndAwait({ type: 'GET_ROOMS' }, 'ROOMS_LIST');
    expect(roomsList.type).toBe('ROOMS_LIST');
    const targetRoom = roomsList.payload.rooms.find((r: any) => r.code === roomCode);
    expect(targetRoom).toBeDefined();
    expect(targetRoom.stakeAmount).toBe(200);

    // 3. Bob joins Alice's room -> Match begins
    const aliceStartPromise = alice.waitForType('GAME_START');
    const bobStart = await bob.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    const aliceStart = await aliceStartPromise;

    expect(aliceStart.payload.status).toBe('playing');
    expect(bobStart.payload.status).toBe('playing');
    expect(aliceStart.payload.activePlayer).toBe('p1');

    // 4. Strategic move sequence: Alice connects 4 horizontally on row 5
    // Alice: col 0, 1, 2, 3
    // Bob: col 0, 1, 2 (stacked on row 4)
    const moves = [
      { client: alice, col: 0 },
      { client: bob, col: 0 },
      { client: alice, col: 1 },
      { client: bob, col: 1 },
      { client: alice, col: 2 },
      { client: bob, col: 2 },
    ];

    for (const m of moves) {
      const wait = alice.waitForType('DISC_DROPPED');
      m.client.send({ type: 'DROP_DISC', payload: { roomCode, column: m.col } });
      await wait;
    }

    // Winning drop by Alice
    const gameOverAlicePromise = alice.waitForType('GAME_OVER');
    const gameOverBobPromise = bob.waitForType('GAME_OVER');
    alice.send({ type: 'DROP_DISC', payload: { roomCode, column: 3 } });

    const [overAlice, overBob] = await Promise.all([gameOverAlicePromise, gameOverBobPromise]);
    expect(overAlice.payload.winner).toBe('p1');
    expect(overBob.payload.winner).toBe('p1');
    expect(overAlice.payload.winnerPayout).toBe(360); // 400 pot - 40 rake

    // 5. Both players vote for Rematch
    const rematchAlicePromise = alice.waitForType('GAME_START');
    const rematchBobPromise = bob.waitForType('GAME_START');

    alice.send({ type: 'REMATCH_REQUEST', payload: { roomCode } });
    bob.send({ type: 'REMATCH_REQUEST', payload: { roomCode } });

    const [rematchAlice, rematchBob] = await Promise.all([rematchAlicePromise, rematchBobPromise]);
    expect(rematchAlice.payload.code).toBe(`${roomCode}-R2`);
    expect(rematchBob.payload.code).toBe(`${roomCode}-R2`);
    expect(rematchAlice.payload.status).toBe('playing');

    alice.close();
    bob.close();
  });

  // =========================================================================
  // WORKLOAD 2: Full Rock Paper Scissors Duel with Tie and Decisive Victory
  // =========================================================================
  it('4.2 should execute a multi-round Rock Paper Scissors duel with draws, score updates, and match conclusion', async () => {
    const p1TgId = 403001;
    const p2TgId = 403002;
    await setupE2EUser(p1TgId, 'RPS_Master_A', 10000);
    await setupE2EUser(p2TgId, 'RPS_Master_B', 10000);

    const p1 = await createAuthClient(p1TgId, 'RPS_Master_A');
    const p2 = await createAuthClient(p2TgId, 'RPS_Master_B');
    const roomCode = generateRoomCode('RPSDUEL');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // Round 1: Rock vs Rock -> Tie (0-0)
    const r1Wait = p1.waitForType('RPS_ROUND_RESOLVED');
    p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
    p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
    const r1 = await r1Wait;
    expect(r1.payload.roundWinner).toBe('draw');
    expect(r1.payload.p1Score).toBe(0);
    expect(r1.payload.p2Score).toBe(0);

    // Round 2: Rock vs Paper -> P2 wins round (0-1)
    const r2Wait = p1.waitForType('RPS_ROUND_RESOLVED');
    p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
    p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'paper' } });
    const r2 = await r2Wait;
    expect(r2.payload.roundWinner).toBe('p2');
    expect(r2.payload.p1Score).toBe(0);
    expect(r2.payload.p2Score).toBe(1);

    // Round 3: Scissors vs Paper -> P1 wins round (1-1)
    const r3Wait = p1.waitForType('RPS_ROUND_RESOLVED');
    p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });
    p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'paper' } });
    const r3 = await r3Wait;
    expect(r3.payload.roundWinner).toBe('p1');
    expect(r3.payload.p1Score).toBe(1);
    expect(r3.payload.p2Score).toBe(1);

    // Round 4: Paper vs Rock -> P1 wins round (2-1)
    const r4Wait = p1.waitForType('RPS_ROUND_RESOLVED');
    p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'paper' } });
    p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
    const r4 = await r4Wait;
    expect(r4.payload.roundWinner).toBe('p1');
    expect(r4.payload.p1Score).toBe(2);

    // Round 5: Rock vs Scissors -> P1 wins round and claims match victory (3-1)
    const gameOverAlice = p1.waitForType('GAME_OVER');
    const gameOverBob = p2.waitForType('GAME_OVER');
    p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
    p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });

    const [over1, over2] = await Promise.all([gameOverAlice, gameOverBob]);
    expect(over1.payload.winner).toBe('p1');
    expect(over2.payload.winner).toBe('p1');
    expect(over1.payload.winnerPayout).toBe(180);

    p1.close();
    p2.close();
  });

  // =========================================================================
  // WORKLOAD 3: Resilient Disconnect & Reconnection Recovery Journey
  // =========================================================================
  it('4.3 should recover cleanly from unexpected socket drops mid-game and complete the match', async () => {
    const p1TgId = 404001;
    const p2TgId = 404002;
    await setupE2EUser(p1TgId, 'Resilient_P1', 10000);
    await setupE2EUser(p2TgId, 'Resilient_P2', 10000);

    let p1 = await createAuthClient(p1TgId, 'Resilient_P1');
    const p2 = await createAuthClient(p2TgId, 'Resilient_P2');
    const roomCode = generateRoomCode('RESILIENT');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // P1 drops disc in col 0
    const drop1Wait = p1.waitForType('DISC_DROPPED');
    p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 0 } });
    await drop1Wait;

    // Unexpected socket termination for P1
    const dcEventWait = p2.waitForType('PLAYER_DISCONNECTED');
    p1.terminate();
    const dcEvent = await dcEventWait;
    expect(dcEvent.payload.player).toBe('p1');
    expect(dcEvent.payload.timeoutMs).toBe(45000);

    // P1 establishes new connection and re-authenticates
    p1 = new E2EClient(wsUrl);
    await p1.connect();
    const authOk = await p1.auth(p1TgId, 'Resilient_P1');
    expect(authOk.payload.activeRoom?.code).toBe(roomCode);

    // P1 syncs room state
    const reconBroadcastWait = p2.waitForType('PLAYER_RECONNECTED');
    const syncRes = await p1.sendAndAwait({ type: 'SYNC_ROOM', payload: { roomCode } }, 'ROOM_STATE');
    await reconBroadcastWait;

    expect(syncRes.payload.status).toBe('playing');
    expect(syncRes.payload.gameState.board[5][0]).toBe('p1');
    expect(syncRes.payload.activePlayer).toBe('p2');

    // P2 takes turn in col 1
    const p2DropWait = p1.waitForType('DISC_DROPPED');
    p2.send({ type: 'DROP_DISC', payload: { roomCode, column: 1 } });
    await p2DropWait;

    // P1 takes turn in col 0
    const p1DropWait = p1.waitForType('DISC_DROPPED');
    p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 0 } });
    const p1Drop = await p1DropWait;
    expect(p1Drop.payload.col).toBe(0);
    expect(p1Drop.payload.row).toBe(4);

    p1.close();
    p2.close();
  });

  // =========================================================================
  // WORKLOAD 4: Voluntary Surrender / Forfeit Flow with Instant Settlement
  // =========================================================================
  it('4.4 should instantly settle match and credit opponent upon voluntary resignation', async () => {
    const p1TgId = 405001;
    const p2TgId = 405002;
    await setupE2EUser(p1TgId, 'Surrender_Winner', 10000);
    await setupE2EUser(p2TgId, 'Surrender_Loser', 10000);

    const p1Start = getE2EUserBalance(p1TgId);
    const p2Start = getE2EUserBalance(p2TgId);

    const p1 = await createAuthClient(p1TgId, 'Surrender_Winner');
    const p2 = await createAuthClient(p2TgId, 'Surrender_Loser');
    const roomCode = generateRoomCode('SURRENDER');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 500 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // Both players are in active match. P2 voluntarily resigns via LEAVE_ROOM
    const gameOverWait = p1.waitForType('GAME_OVER');
    p2.send({ type: 'LEAVE_ROOM', payload: { roomCode } });

    const gameOver = await gameOverWait;
    expect(gameOver.payload.winner).toBe('p1');
    expect(gameOver.payload.isForfeit).toBe(true);
    expect(gameOver.payload.winnerPayout).toBe(900); // 1000 pot - 100 rake

    // Verify ledger balance
    const p1End = getE2EUserBalance(p1TgId);
    const p2End = getE2EUserBalance(p2TgId);

    expect(p1End).toBe(p1Start + 400); // won 900 - staked 500 = +400
    expect(p2End).toBe(p2Start - 500); // staked 500 and lost

    p1.close();
    p2.close();
  });
});
