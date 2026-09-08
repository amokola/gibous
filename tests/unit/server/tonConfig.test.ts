import { describe, expect, it } from 'vitest';
import { getTonConnectNetworkId } from '../../../shared/constants/ton';
import { validateMainnetTonConfig } from '../../../server/tonConfig';

const validMainnetConfig = {
  TON_ASSET_MODE: 'native_ton',
  TON_NETWORK: 'mainnet',
  TON_DEPOSIT_ADDRESS: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
  TONCENTER_API_URL: 'https://toncenter.com/api/v2/jsonRPC',
};

describe('TON mainnet configuration', () => {
  it('maps TON Connect to the official mainnet network id', () => {
    expect(getTonConnectNetworkId('mainnet')).toBe('-239');
    expect(getTonConnectNetworkId('testnet')).toBe('-3');
    expect(getTonConnectNetworkId('invalid')).toBeNull();
  });

  it('accepts a valid native TON mainnet verifier configuration', () => {
    expect(validateMainnetTonConfig(validMainnetConfig)).toEqual([]);
  });

  it('rejects testnet, insecure, malformed, and wrong-network verifier settings', () => {
    expect(validateMainnetTonConfig({
      ...validMainnetConfig,
      TON_NETWORK: 'testnet',
      TONCENTER_API_URL: 'https://testnet.toncenter.com/api/v2/jsonRPC',
      TON_DEPOSIT_ADDRESS: 'not-an-address',
    })).toEqual(expect.arrayContaining([
      'TON_NETWORK=mainnet',
      'TONCENTER_API_URL=mainnet endpoint',
      'TON_DEPOSIT_ADDRESS=valid TON address',
    ]));

    expect(validateMainnetTonConfig({
      ...validMainnetConfig,
      TONCENTER_API_URL: 'http://toncenter.com/api/v2/jsonRPC',
    })).toContain('TONCENTER_API_URL=https');
  });
});
