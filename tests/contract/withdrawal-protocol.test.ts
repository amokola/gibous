import { describe, expect, it } from 'vitest';
import { ClientMessageSchema, ServerMessageSchema } from '../../shared/schemas/protocol';

describe('mainnet withdrawal protocol', () => {
  it('accepts a quote request and rejects client supplied fee or net amounts', () => {
    expect(ClientMessageSchema.safeParse({
      type: 'REQUEST_WITHDRAWAL_QUOTE', requestId: 'quote-1',
      payload: { walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz', amountNano: '1000000000' },
    }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({
      type: 'REQUEST_WITHDRAWAL_QUOTE',
      payload: { walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz', amountNano: '1000000000', feeNano: '1', netAmountNano: '2' },
    }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({
      type: 'CONFIRM_WITHDRAWAL', payload: { quoteId: 'f4b12ac8-1c11-4c4a-af8e-11dd9ba0a712', feeNano: '1' },
    }).success).toBe(false);
  });

  it('represents accepted withdrawals as pending and status updates as persisted states', () => {
    const payload = {
      id: 'withdrawal-1', status: 'pending', grossAmountNano: '1000000000', feeNano: '1000000',
      netAmountNano: '999000000', amountGram: 1, walletAddress: 'EQ-address', createdAt: new Date().toISOString(),
    };
    expect(ServerMessageSchema.safeParse({ type: 'WITHDRAWAL_PENDING', payload }).success).toBe(true);
    expect(ServerMessageSchema.safeParse({ type: 'WITHDRAWAL_UPDATED', payload: { ...payload, status: 'completed', txHash: 'hash' } }).success).toBe(true);
    expect(ServerMessageSchema.safeParse({ type: 'WITHDRAWAL_UPDATED', payload: { ...payload, status: 'failed' } }).success).toBe(true);
  });
});
