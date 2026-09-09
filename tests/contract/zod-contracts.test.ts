import { describe, it, expect } from 'vitest';
import {
  ClientMessageSchema,
  ServerMessageSchema,
} from '../../shared';

describe('Shared Zod Protocol Contract Tests', () => {
  describe('Client Message Contract Validation', () => {
    it('should validate valid AUTH message', () => {
      const msg = {
        type: 'AUTH',
        requestId: 'req-1',
        payload: {
          telegramId: 123456,
          playerName: 'Alice',
          avatarUrl: 'https://example.com/pic.jpg',
        },
      };
      expect(ClientMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate valid CREATE_ROOM message', () => {
      const msg = {
        type: 'CREATE_ROOM',
        requestId: 'req-2',
        payload: {
          roomCode: 'TEST01',
          gameType: 'connect4',
          stake: 250,
        },
      };
      expect(ClientMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should reject unbounded identity and request fields', () => {
      const result = ClientMessageSchema.safeParse({
        type: 'AUTH',
        requestId: 'x'.repeat(129),
        payload: {
          telegramId: 1,
          playerName: 'x'.repeat(129),
          avatarUrl: 'x'.repeat(2049),
        },
      });

      expect(result.success).toBe(false);
    });

    it('should validate valid DROP_DISC message and reject out-of-bounds columns', () => {
      const validMsg = {
        type: 'DROP_DISC',
        payload: { roomCode: 'ROOM01', column: 3 },
      };
      expect(ClientMessageSchema.safeParse(validMsg).success).toBe(true);

      const invalidColumnUnder = {
        type: 'DROP_DISC',
        payload: { roomCode: 'ROOM01', column: -1 },
      };
      expect(ClientMessageSchema.safeParse(invalidColumnUnder).success).toBe(false);

      const invalidColumnOver = {
        type: 'DROP_DISC',
        payload: { roomCode: 'ROOM01', column: 7 },
      };
      expect(ClientMessageSchema.safeParse(invalidColumnOver).success).toBe(false);
    });

    it('should validate valid CHOOSE_RPS and reject unknown choices', () => {
      const validMsg = {
        type: 'CHOOSE_RPS',
        payload: { roomCode: 'RPS01', choice: 'rock' },
      };
      expect(ClientMessageSchema.safeParse(validMsg).success).toBe(true);

      const invalidMsg = {
        type: 'CHOOSE_RPS',
        payload: { roomCode: 'RPS01', choice: 'laser' },
      };
      expect(ClientMessageSchema.safeParse(invalidMsg).success).toBe(false);
    });

    it('should validate PING and EMOTE messages', () => {
      expect(ClientMessageSchema.safeParse({ type: 'PING', payload: { timestamp: Date.now() } }).success).toBe(true);
      expect(ClientMessageSchema.safeParse({ type: 'EMOTE', payload: { roomCode: 'R1', emoji: '🔥' } }).success).toBe(true);
    });

    it('should validate CREATE_DEPOSIT_INTENT and SUBMIT_DEPOSIT messages', () => {
      const createIntent = {
        type: 'CREATE_DEPOSIT_INTENT',
        requestId: 'req-dep-1',
        payload: {
          amountNano: '1000000000',
          walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        },
      };
      expect(ClientMessageSchema.safeParse(createIntent).success).toBe(true);

      const submitDeposit = {
        type: 'SUBMIT_DEPOSIT',
        requestId: 'req-dep-2',
        payload: {
          intentId: 'dep-intent-uuid-1234',
          walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
          depositAddress: 'EQD48x9_gibous_vault_address_12345',
          amountNano: '1000000000',
          boc: 'base64bocstring',
          network: 'testnet',
        },
      };
      expect(ClientMessageSchema.safeParse(submitDeposit).success).toBe(true);

      const cancelIntent = {
        type: 'CANCEL_DEPOSIT_INTENT',
        requestId: 'req-dep-3',
        payload: {
          intentId: 'dep-intent-uuid-1234',
        },
      };
      expect(ClientMessageSchema.safeParse(cancelIntent).success).toBe(true);
    });
  });

  describe('Server Message Contract Validation', () => {
    it('should validate AUTH_OK server message', () => {
      const msg = {
        type: 'AUTH_OK',
        payload: {
          telegramId: 12345,
          user: { id: 1, first_name: 'Test' },
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate DICE_ROLLED server message', () => {
      const msg = {
        type: 'DICE_ROLLED',
        payload: {
          roomCode: 'SNAKE01',
          player: 'p1',
          value: 5,
          from: 1,
          to: 6,
          nextPlayer: 'p2',
          isWinner: false,
          version: 2,
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate GAME_OVER server message', () => {
      const msg = {
        type: 'GAME_OVER',
        payload: {
          roomCode: 'ROOM01',
          winner: 'p1',
          potAmount: 200,
          winnerPayout: 180,
          loserPayout: 0,
          arenaFee: 20,
          xpEarned: 150,
          version: 5,
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate ERROR server message', () => {
      const msg = {
        type: 'ERROR',
        payload: {
          code: 'UNAUTHORIZED',
          message: 'Access denied',
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate DEPOSIT_INTENT_CREATED server message', () => {
      const msg = {
        type: 'DEPOSIT_INTENT_CREATED',
        requestId: 'req-dep-1',
        payload: {
          intentId: 'dep-intent-uuid-1234',
          memo: 'dep_42_a8c9e2f4',
          depositAddress: 'EQD48x9_gibous_vault_address_12345',
          amountNano: '1000000000',
          expiresAt: new Date().toISOString(),
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate DEPOSIT_INTENT_CANCELLED server message', () => {
      const msg = {
        type: 'DEPOSIT_INTENT_CANCELLED',
        requestId: 'req-dep-cancel-1',
        payload: {
          intentId: 'dep-intent-uuid-1234',
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('should validate TRANSACTION_CONFIRMED server message', () => {
      const msg = {
        type: 'TRANSACTION_CONFIRMED',
        requestId: 'req-tx-1',
        payload: {
          id: 'tx-uuid-1234',
          type: 'withdraw',
          amountGram: 5,
          status: 'completed',
          createdAt: new Date().toISOString(),
          walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        },
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });
  });
});
