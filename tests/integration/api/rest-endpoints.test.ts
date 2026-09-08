import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, storage } from '../../../server/server';
import { DatabasePool } from '../../../server/db/index';
import { createBragShareToken } from '../../../server/bragShareToken';

describe('REST API Endpoints Integration Tests', () => {
  it('GET /api/health should return ok status and current timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(res.body).toEqual({
      status: 'ok',
      timestamp: expect.any(Number),
    });
  });

  it('GET /api/ready should report test-adapter dependencies ready', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', checks: { database: 'ok' } });
  });

  it('GET /api/rooms should return an array of active open waiting rooms', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rooms');
    expect(Array.isArray(res.body.rooms)).toBe(true);
  });

  it('POST /api/rooms should successfully create a room and return room details', async () => {
    const uniqueTgId = 777100 + Math.floor(Math.random() * 1000);
    await storage.getOrCreateUser({ id: uniqueTgId, first_name: 'RoomHost' });

    const payload = {
      roomCode: `API${Math.floor(Math.random() * 1000)}`,
      gameType: 'connect4',
      stake: 100,
      telegramId: uniqueTgId,
      playerName: 'RoomHost',
    };

    const res = await request(app)
      .post('/api/rooms')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.room.code).toBe(payload.roomCode);
    expect(res.body.room.status).toBe('waiting');
  });

  it('POST /api/rooms should reject room creation when user has insufficient balance', async () => {
    const brokeTgId = 777200 + Math.floor(Math.random() * 1000);
    const user = await storage.getOrCreateUser({ id: brokeTgId, first_name: 'BrokeAPI' });
    user.balance_gram = 20;
    DatabasePool.getInstance().saveUser(user);

    const payload = {
      roomCode: `BROKE${Math.floor(Math.random() * 1000)}`,
      gameType: 'snake',
      stake: 100, // exceeds available balance 20
      telegramId: brokeTgId,
      playerName: 'BrokeAPI',
    };

    const res = await request(app)
      .post('/api/rooms')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Insufficient balance');
  });

  it('GET /api/user/:telegramId should return user profile data', async () => {
    const tgId = 777300 + Math.floor(Math.random() * 1000);
    await storage.getOrCreateUser({
      id: tgId,
      first_name: 'QueryUser',
      username: 'query_user',
    });

    const res = await request(app).get(`/api/user/${tgId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.telegram_id).toBe(tgId);
    expect(res.body.user.balance_gram).toBe(2450);
  });

  it('GET /api/user/:telegramId should return 400 when telegramId is invalid/NaN', async () => {
    const res = await request(app).get('/api/user/not-a-number');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid telegramId' });
  });

  it('POST /api/admin/credit must not expose a public financial mutation', async () => {
    const targetId = 777350 + Math.floor(Math.random() * 1000);
    const res = await request(app)
      .post('/api/admin/credit')
      .send({ telegramId: targetId, amount: 1000, description: 'test' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(404);
    expect(await storage.getAccountSnapshot(targetId)).toBeNull();
  });

  it('does not expose unauthenticated room or user routes outside the test adapter', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const roomResponse = await request(app).post('/api/rooms').send({ telegramId: 1, stake: 100 });
      const userResponse = await request(app).get('/api/user/1');
      expect(roomResponse.status).toBe(401);
      expect(userResponse.status).toBe(401);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('GET /api/telegram/brag/image/:token.jpg should return a JPEG card for a signed token', async () => {
    const telegramId = 777400 + Math.floor(Math.random() * 1000);
    await storage.getOrCreateUser({ id: telegramId, first_name: 'BragImage' });
    const secret = process.env.TELEGRAM_BRAG_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'demo-brag-secret';
    const token = createBragShareToken(telegramId, new Date(), secret);

    const res = await request(app).get(`/api/telegram/brag/image/${token}.jpg`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect([...res.body.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it('keeps in-memory settlement match codes available for daily brag stats', async () => {
    const winnerId = 777500 + Math.floor(Math.random() * 1000);
    const loserId = winnerId + 1;
    await storage.getOrCreateUser({ id: winnerId, first_name: 'BragWinner' });
    await storage.getOrCreateUser({ id: loserId, first_name: 'BragLoser' });
    const matchCode = `BRAG${Math.floor(Math.random() * 100000)}`;

    expect((await storage.debitStake(winnerId, 100, matchCode)).success).toBe(true);
    expect((await storage.debitStake(loserId, 100, matchCode)).success).toBe(true);
    await storage.finalizeWinMatch(matchCode, 'rps', 100, winnerId, loserId);

    const stats = await storage.getDailyBragStats(winnerId);
    expect(stats?.today.matches).toBe(1);
    expect(stats?.today.wins).toBe(1);
    expect(stats?.today.volume).toBe(100);
  });
});
