import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { server, storage } from '../../../server/server';
import { DatabasePool } from '../../../server/db';
import { connectTestClient, sendAndAwaitResponse } from '../../setup/test-helpers';
import { generateValidInitData, TEST_BOT_TOKEN } from '../../setup/mock-data';

const depositAddress = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
const senderAddress = 'EQBvW8Z5huBkMJYdnfAEM5JqTNt2XYBaxLVTNVGZDp0_Av';
const recipientAddress = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
let wsUrl = '';
let nextTelegramId = 991100;

describe('deposit and withdrawal WebSocket boundaries', () => {
  const sockets = new Set<WebSocket>();

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
    process.env.TON_DEPOSIT_ADDRESS = depositAddress;
    process.env.TON_NETWORK = 'testnet';
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 3001;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function connect() {
    const socket = await connectTestClient(wsUrl);
    sockets.add(socket);
    return socket;
  }

  async function authenticate(socket: WebSocket, telegramId: number) {
    const firstName = `Economy${telegramId}`;
    return sendAndAwaitResponse(socket, {
      type: 'AUTH',
      requestId: `auth-${telegramId}`,
      payload: { telegramId, playerName: firstName, initData: generateValidInitData({ id: telegramId, first_name: firstName }) },
    }, 'AUTH_OK');
  }

  it('rejects deposit and withdrawal mutations before authentication', async () => {
    const socket = await connect();
    const userId = nextTelegramId++;
    await storage.getOrCreateUser({ id: userId, first_name: 'Unauthenticated' });
    const intent = await storage.createDepositIntent({
      telegramId: userId, amountNano: '1000000000', walletAddress: senderAddress, depositAddress, network: 'testnet',
    });

    const submit = await sendAndAwaitResponse(socket, {
      type: 'SUBMIT_DEPOSIT', requestId: `unauth-deposit-${userId}`,
      payload: { intentId: intent.id, walletAddress: senderAddress, depositAddress, amountNano: '1000000000', boc: 'unauth-boc', network: 'testnet' },
    }, 'ERROR');
    expect(submit.payload.code).toBe('UNAUTHORIZED');

    const quote = await sendAndAwaitResponse(socket, {
      type: 'REQUEST_WITHDRAWAL_QUOTE', requestId: `unauth-quote-${userId}`,
      payload: { walletAddress: recipientAddress, amountNano: '1000000000' },
    }, 'ERROR');
    expect(quote.payload.code).toBe('UNAUTHORIZED');

    const confirm = await sendAndAwaitResponse(socket, {
      type: 'CONFIRM_WITHDRAWAL', requestId: `unauth-confirm-${userId}`,
      payload: { quoteId: '11111111-1111-4111-8111-111111111111' },
    }, 'ERROR');
    expect(confirm.payload.code).toBe('UNAUTHORIZED');
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc ?? null).toBeNull();
  });

  it('binds deposit submission to the authenticated user and exact intent details', async () => {
    const ownerId = nextTelegramId++;
    const otherId = nextTelegramId++;
    await storage.getOrCreateUser({ id: ownerId, first_name: 'Owner' });
    await storage.getOrCreateUser({ id: otherId, first_name: 'Other' });
    const owner = await storage.getOrCreateUser({ id: ownerId, first_name: 'Owner' });
    const intent = await storage.createDepositIntent({
      telegramId: ownerId, amountNano: '1500000000', walletAddress: senderAddress, depositAddress, network: 'testnet',
    });
    const socket = await connect();
    await authenticate(socket, otherId);

    const stolen = await sendAndAwaitResponse(socket, {
      type: 'SUBMIT_DEPOSIT', requestId: `stolen-deposit-${ownerId}`,
      payload: { intentId: intent.id, walletAddress: senderAddress, depositAddress, amountNano: '1500000000', boc: 'stolen-boc', network: 'testnet' },
    }, 'ERROR');
    expect(stolen.payload.code).toBe('DEPOSIT_REJECTED');
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc ?? null).toBeNull();

    const wrongSender = await sendAndAwaitResponse(socket, {
      type: 'SUBMIT_DEPOSIT', requestId: `wrong-sender-${ownerId}`,
      payload: { intentId: intent.id, walletAddress: recipientAddress, depositAddress, amountNano: '1500000000', boc: 'wrong-sender-boc', network: 'testnet' },
    }, 'ERROR');
    expect(wrongSender.payload.code).toBe('DEPOSIT_REJECTED');
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.wallet_address).toBe(senderAddress);
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc ?? null).toBeNull();

    const ownerSocket = await connect();
    await authenticate(ownerSocket, ownerId);
    const pending = await sendAndAwaitResponse(ownerSocket, {
      type: 'SUBMIT_DEPOSIT', requestId: `valid-deposit-${ownerId}`,
      payload: { intentId: intent.id, walletAddress: senderAddress, depositAddress, amountNano: '1500000000', boc: 'valid-boc', network: 'testnet' },
    }, 'TRANSACTION_PENDING');

    expect(pending.payload.id).toBe(intent.id);
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)).toMatchObject({ status: 'pending', boc: 'valid-boc', wallet_address: senderAddress });
    expect(DatabasePool.getInstance().getUserByTelegramId(ownerId)?.balance_nano).toBe(owner.balance_nano);
    expect(DatabasePool.getInstance().getTransactionsForUser(owner.id).filter((tx: any) => tx.type === 'deposit')).toHaveLength(0);
  });

  it('rejects quote requests when automatic payouts are unavailable without persisting a quote', async () => {
    const telegramId = nextTelegramId++;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Quote Gate' });
    const socket = await connect();
    await authenticate(socket, telegramId);

    const response = await sendAndAwaitResponse(socket, {
      type: 'REQUEST_WITHDRAWAL_QUOTE', requestId: `worker-unavailable-${telegramId}`,
      payload: { walletAddress: recipientAddress, amountNano: '1000000000' },
    }, 'ERROR');

    expect(response.payload.code).toBe('WITHDRAWAL_UNAVAILABLE');
    expect((DatabasePool.getInstance() as any).inMemoryDb.get('withdrawal_quotes')).toHaveLength(0);
  });
});
