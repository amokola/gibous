import 'dotenv/config';
import { Pool } from 'pg';
import { RoomManager } from '../../server/roomManager';
import { StorageService } from '../../server/storage';

const mode = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (process.env.RELEASE_GATE_CONFIRM !== 'YES' || !databaseUrl) {
  throw new Error('Set RELEASE_GATE_CONFIRM=YES and DATABASE_URL for the disposable recovery database.');
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
if (!databaseName.includes('release_gate')) {
  throw new Error(`Refusing to mutate database '${databaseName}'; database name must include release_gate.`);
}

process.env.NODE_ENV = 'development';

const pool = new Pool({ connectionString: databaseUrl, max: 10 });
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const insertUser = async (telegramId: number) => {
  const result = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, balance_nano)
     VALUES ($1, $2, $3, '500000000000') RETURNING id, telegram_id`,
    [telegramId, `recovery_${telegramId}`, `Recovery ${telegramId}`],
  );
  return { id: Number(result.rows[0].id), telegramId: Number(result.rows[0].telegram_id) };
};

const playRpsWin = async (manager: RoomManager, code: string, requestPrefix: string) => {
  for (let round = 1; round <= 3; round += 1) {
    const first = manager.executeAction(code, 'p1', 'CHOOSE_RPS', { choice: 'rock' }, `${requestPrefix}-p1-${round}`);
    const second = manager.executeAction(code, 'p2', 'CHOOSE_RPS', { choice: 'scissors' }, `${requestPrefix}-p2-${round}`);
    assert(first.success && second.success, `RPS round ${round} failed for ${code}`);
    const room = manager.getRoom(code);
    assert(room, `Missing RPS room ${code}`);
    await manager.persistCurrentState(room);
  }
};

const setup = async () => {
  await pool.query('TRUNCATE transactions, settlements, deposit_intents, matches, users, treasury RESTART IDENTITY CASCADE');
  await pool.query('INSERT INTO treasury (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const users = new Map<number, { id: number; telegramId: number }>();
  for (let id = 920001; id <= 920012; id += 1) users.set(id, await insertUser(id));

  const manager = new RoomManager();
  const waiting = await manager.createRoom('REC-WAITING', 'snake', 100, 920001, 'Waiting Player');
  assert(waiting.room, 'Could not create waiting recovery room');

  const active = await manager.createRoom('REC-ACTIVE', 'connect4', 100, 920003, 'Active Player 1');
  assert(active.room, 'Could not create active recovery room');
  assert((await manager.joinRoom('REC-ACTIVE', 920004, 'Active Player 2')).room, 'Could not join active recovery room');
  const activeAction = manager.executeAction('REC-ACTIVE', 'p1', 'DROP_DISC', { column: 3 }, 'REC-ACTIVE-ACTION-1');
  assert(activeAction.success, 'Could not persist active Connect 4 action');
  await manager.persistCurrentState(manager.getRoom('REC-ACTIVE')!);

  const hidden = await manager.createRoom('REC-RPS-HIDDEN', 'rps', 100, 920005, 'RPS Player 1');
  assert(hidden.room, 'Could not create hidden-choice room');
  assert((await manager.joinRoom('REC-RPS-HIDDEN', 920006, 'RPS Player 2')).room, 'Could not join hidden-choice room');
  const hiddenAction = manager.executeAction('REC-RPS-HIDDEN', 'p1', 'CHOOSE_RPS', { choice: 'paper' }, 'REC-RPS-HIDDEN-ACTION-1');
  assert(hiddenAction.success, 'Could not commit hidden RPS choice');
  await manager.persistCurrentState(manager.getRoom('REC-RPS-HIDDEN')!);

  const pending = await manager.createRoom('REC-RPS-PENDING', 'rps', 100, 920007, 'Pending Player 1');
  assert(pending.room, 'Could not create pending-settlement room');
  assert((await manager.joinRoom('REC-RPS-PENDING', 920008, 'Pending Player 2')).room, 'Could not join pending-settlement room');
  await playRpsWin(manager, 'REC-RPS-PENDING', 'REC-RPS-PENDING-ACTION');
  const pendingRoom = manager.getRoom('REC-RPS-PENDING');
  assert(pendingRoom?.status === 'gameover' && pendingRoom.settlementStatus === 'pending', 'Pending settlement was not persisted');

  const completed = await manager.createRoom('REC-COMPLETED', 'rps', 100, 920009, 'Completed Player 1');
  assert(completed.room, 'Could not create completed room');
  assert((await manager.joinRoom('REC-COMPLETED', 920010, 'Completed Player 2')).room, 'Could not join completed room');
  await playRpsWin(manager, 'REC-COMPLETED', 'REC-COMPLETED-ACTION');
  const storage = new StorageService();
  await storage.finalizeWinMatch('REC-COMPLETED', 'rps', 100, 920009, 920010);
  const completedRoom = manager.getRoom('REC-COMPLETED');
  assert(completedRoom, 'Completed room disappeared before persistence');
  completedRoom.settlementStatus = 'committed';
  await manager.persistCurrentState(completedRoom);

  const disconnected = await manager.createRoom('REC-DISCONNECT', 'snake', 100, 920011, 'Disconnected Player 1');
  assert(disconnected.room, 'Could not create disconnected room');
  assert((await manager.joinRoom('REC-DISCONNECT', 920012, 'Disconnected Player 2')).room, 'Could not join disconnected room');
  await manager.handleDisconnect(920012);

  const snapshot = await pool.query(`
    SELECT code, status, state_payload->>'settlementStatus' AS settlement_status
      FROM matches
     WHERE code LIKE 'REC-%'
     ORDER BY code
  `);
  console.log(JSON.stringify({ mode: 'setup', database: databaseName, persistedMatches: snapshot.rows }, null, 2));
};

const recover = async () => {
  const manager = new RoomManager();
  await manager.restorePersistedRooms();

  const waiting = manager.getRoom('REC-WAITING');
  const active = manager.getRoom('REC-ACTIVE');
  const hidden = manager.getRoom('REC-RPS-HIDDEN');
  const pending = manager.getRoom('REC-RPS-PENDING');
  const disconnected = manager.getRoom('REC-DISCONNECT');
  assert(waiting?.status === 'waiting', 'Waiting room was not recovered');
  assert(active?.status === 'playing' && active.engine.getState().board, 'Active Connect 4 state was not recovered');
  assert(hidden?.status === 'playing', 'RPS hidden-choice room was not recovered');
  const hiddenPersistence = hidden?.engine.getPersistenceState() as { secretChoices?: { p1?: string | null } } | undefined;
  assert(hiddenPersistence?.secretChoices?.p1 === 'paper', 'Committed hidden RPS choice was not recovered');
  assert(pending?.status === 'gameover' && pending.settlementStatus === 'committed', 'Pending settlement was not reconciled on recovery');
  assert(disconnected?.p2?.isConnected === false, 'Disconnected player state was not recovered');

  const reconnected = await manager.reconnectPlayer('REC-DISCONNECT', 920012);
  assert(reconnected.role === 'p2' && reconnected.room?.p2?.isConnected === true, 'Disconnected player could not reconnect to recovered room');

  const settlementCount = Number((await pool.query("SELECT COUNT(*) AS count FROM settlements WHERE match_id IN ('REC-RPS-PENDING', 'REC-COMPLETED')")).rows[0].count);
  const payoutCount = Number((await pool.query("SELECT COUNT(*) AS count FROM transactions WHERE operation_key IN ('settlement:REC-RPS-PENDING:winner', 'settlement:REC-COMPLETED:winner')")).rows[0].count);
  const negativeBalances = Number((await pool.query('SELECT COUNT(*) AS count FROM users WHERE balance_nano < 0')).rows[0].count);
  assert(settlementCount === 2, 'Recovery changed the number of committed settlements');
  assert(payoutCount === 2, 'Recovery duplicated or lost a payout');
  assert(negativeBalances === 0, 'Recovery produced a negative balance');

  console.log(JSON.stringify({
    mode: 'recover',
    status: 'VERIFIED',
    database: databaseName,
    recovered: ['waiting', 'active-connect4', 'rps-hidden-choice', 'pending-settlement', 'disconnected-player'],
    settlementCount,
    payoutCount,
    negativeBalances,
    completedMatchExcludedFromActiveRecovery: manager.getRoom('REC-COMPLETED') === undefined,
  }, null, 2));
};

try {
  if (mode === 'setup') await setup();
  else if (mode === 'recover') await recover();
  else throw new Error('Usage: recovery.ts setup|recover');
} finally {
  await pool.end();
}

process.exit(0);
