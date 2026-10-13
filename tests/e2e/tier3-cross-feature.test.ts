import { describe, it, expect, beforeAll } from 'vitest';
import { ensureE2EServer, createAuthClient, generateRoomCode, E2EClient, getE2EUserBalance, setupE2EUser } from './e2e-harness';

describe('Tier 3: Cross-Feature Combinations E2E Test Suite', () => {
  let wsUrl: string;

  beforeAll(async () => {
    wsUrl = await ensureE2EServer();
  });

  it('3.1 should handle mid-turn disconnection, reconnection, and seamless move continuation', async () => {
    const p1 = await createAuthClient(301001, 'MidTurn_P1');
    let p2 = await createAuthClient(301002, 'MidTurn_P2');
    const roomCode = generateRoomCode('MIDTURN');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // P1 drops in col 3
    const drop1Wait = p1.waitForType('DISC_DROPPED');
    p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 3 } });
    await drop1Wait;

    // Now it is P2's turn. P2's connection drops!
    const dcWait = p1.waitForType('PLAYER_DISCONNECTED');
    p2.close();
    const dcEvent = await dcWait;
    expect(dcEvent.payload.player).toBe('p2');

    // P2 reconnects on a fresh socket
    p2 = new E2EClient(wsUrl);
    await p2.connect();
    const authRes = await p2.auth(301002, 'MidTurn_P2');
    expect(authRes.payload.activeRoom?.code).toBe(roomCode);

    const reconWait = p1.waitForType('PLAYER_RECONNECTED');
    const syncRes = await p2.sendAndAwait({ type: 'SYNC_ROOM', payload: { roomCode } }, 'ROOM_STATE');
    await reconWait;

    expect(syncRes.payload.activePlayer).toBe('p2');

    // P2 successfully performs their turn now!
    const drop2P1Wait = p1.waitForType('DISC_DROPPED');
    const drop2P2Wait = p2.waitForType('DISC_DROPPED');
    p2.send({ type: 'DROP_DISC', payload: { roomCode, column: 4 } });

    const [d2P1, d2P2] = await Promise.all([drop2P1Wait, drop2P2Wait]);
    expect(d2P1.payload.player).toBe('p2');
    expect(d2P1.payload.col).toBe(4);
    expect(d2P1.payload.nextPlayer).toBe('p1');
    expect(d2P2.payload.col).toBe(4);

    p1.close();
    p2.close();
  });

  it('3.2 should handle full rematch agreement workflow after normal victory', async () => {
    const p1 = await createAuthClient(302001, 'Rematch_P1');
    const p2 = await createAuthClient(302002, 'Rematch_P2');
    const roomCode = generateRoomCode('REMATCH');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // Fast 3-round win for P1
    for (let r = 0; r < 3; r++) {
      const wait = r === 2 ? p1.waitForType('GAME_OVER') : p1.waitForType('RPS_ROUND_RESOLVED');
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });
      await wait;
    }

    // Both players vote for rematch
    const nextRoomStartP1 = p1.waitForType('GAME_START');
    const nextRoomStartP2 = p2.waitForType('GAME_START');

    p1.send({ type: 'REMATCH_REQUEST', payload: { roomCode } });
    p2.send({ type: 'REMATCH_REQUEST', payload: { roomCode } });

    const [newStart1, newStart2] = await Promise.all([nextRoomStartP1, nextRoomStartP2]);
    expect(newStart1.payload.code).toContain('-R2');
    expect(newStart2.payload.code).toBe(newStart1.payload.code);
    expect(newStart1.payload.status).toBe('playing');

    p1.close();
    p2.close();
  });

  it('3.3 should handle rematch agreement workflow after forfeit', async () => {
    const p1 = await createAuthClient(303001, 'ForfeitRematch_P1');
    const p2 = await createAuthClient(303002, 'ForfeitRematch_P2');
    const roomCode = generateRoomCode('FFREMATCH');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // P2 forfeits via LEAVE_ROOM
    const gameOverWait = p1.waitForType('GAME_OVER');
    p2.send({ type: 'LEAVE_ROOM', payload: { roomCode } });
    await gameOverWait;

    // Both vote for rematch
    const nextRoomStartP1 = p1.waitForType('GAME_START');
    const nextRoomStartP2 = p2.waitForType('GAME_START');

    p1.send({ type: 'REMATCH_REQUEST', payload: { roomCode } });
    p2.send({ type: 'REMATCH_REQUEST', payload: { roomCode } });

    const [newStart1, newStart2] = await Promise.all([nextRoomStartP1, nextRoomStartP2]);
    expect(newStart1.payload.code).toContain('-R2');
    expect(newStart1.payload.status).toBe('playing');

    p1.close();
    p2.close();
  });

  it('3.4 should enforce precise escrow ledger accounting on 500 GRAM stake matches', async () => {
    const p1TgId = 304001;
    const p2TgId = 304002;
    await setupE2EUser(p1TgId, 'Audit_P1', 10000);
    await setupE2EUser(p2TgId, 'Audit_P2', 10000);

    const p1Start = getE2EUserBalance(p1TgId);
    const p2Start = getE2EUserBalance(p2TgId);

    const p1 = await createAuthClient(p1TgId, 'Audit_P1');
    const p2 = await createAuthClient(p2TgId, 'Audit_P2');
    const roomCode = generateRoomCode('AUDIT500');

    // Create and join with 500 stake
    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 500 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // P1 quick horizontal win:
    // P1: 0, 1, 2, 3 (row 5)
    // P2: 0, 1, 2 (row 4)
    const turns = [
      { client: p1, col: 0 },
      { client: p2, col: 0 },
      { client: p1, col: 1 },
      { client: p2, col: 1 },
      { client: p1, col: 2 },
      { client: p2, col: 2 },
    ];
    for (const t of turns) {
      const wait = p1.waitForType('DISC_DROPPED');
      t.client.send({ type: 'DROP_DISC', payload: { roomCode, column: t.col } });
      await wait;
    }

    const gameOverWait = p1.waitForType('GAME_OVER');
    p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 3 } });
    const gameOver = await gameOverWait;

    expect(gameOver.payload.winner).toBe('p1');
    expect(gameOver.payload.winnerPayout).toBe(900); // 1000 pot - 100 fee (10%)

    // Ledger balance verification
    const p1End = getE2EUserBalance(p1TgId);
    const p2End = getE2EUserBalance(p2TgId);

    expect(p1End).toBe(p1Start + 400); // won 900 - staked 500 = +400
    expect(p2End).toBe(p2Start - 500); // lost 500

    p1.close();
    p2.close();
  });

  it('3.5 should broadcast real-time emotes during gameplay without desyncing turns', async () => {
    const p1 = await createAuthClient(305001, 'Emote_P1');
    const p2 = await createAuthClient(305002, 'Emote_P2');
    const roomCode = generateRoomCode('EMOTE');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // P1 sends emote
    const emoteP2Wait = p2.waitForType('EMOTE');
    p1.send({ type: 'EMOTE', payload: { roomCode, emoji: '🔥' } });
    const emoteEvent = await emoteP2Wait;

    expect(emoteEvent.payload.emoji).toBe('🔥');
    expect(emoteEvent.payload.player).toBe('p1');

    // Normal game moves still succeed
    const rollWait = p1.waitForType('DICE_ROLLED');
    p1.send({ type: 'ROLL_DICE', payload: { roomCode } });
    const roll = await rollWait;
    expect(roll.payload.player).toBe('p1');

    p1.close();
    p2.close();
  });

  it('3.6 should gracefully resolve double socket disconnect without server crashes', async () => {
    const p1 = await createAuthClient(306001, 'DoubleDC_P1');
    const p2 = await createAuthClient(306002, 'DoubleDC_P2');
    const roomCode = generateRoomCode('DOUBLEDROP');

    await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
    const startPromise = p1.waitForType('GAME_START');
    await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
    await startPromise;

    // Both disconnect abruptly
    p1.terminate();
    p2.terminate();

    // Verify system continues accepting new connections and queries
    const probe = await createAuthClient(306003, 'Probe_Client');
    const probeRoom = generateRoomCode('PROBE');
    const createRes = await probe.sendAndAwait(
      { type: 'CREATE_ROOM', payload: { roomCode: probeRoom, gameType: 'snake', stake: 100 } },
      'ROOM_CREATED'
    );
    expect(createRes.payload.code).toBe(probeRoom);

    probe.close();
  });
});
