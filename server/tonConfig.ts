import { Address } from '@ton/core';

/** Mainnet startup requirements for the native TON deposit path. */
export function validateMainnetTonConfig(env: Record<string, string | undefined> = process.env): string[] {
  const issues: string[] = [];

  if (env.TON_ASSET_MODE !== 'native_ton') issues.push('TON_ASSET_MODE=native_ton');
  if (env.TON_NETWORK !== 'mainnet') issues.push('TON_NETWORK=mainnet');

  if (!env.TON_DEPOSIT_ADDRESS) {
    issues.push('TON_DEPOSIT_ADDRESS');
  } else {
    try {
      Address.parse(env.TON_DEPOSIT_ADDRESS);
    } catch {
      issues.push('TON_DEPOSIT_ADDRESS=valid TON address');
    }
  }

  if (!env.TONCENTER_API_URL) {
    issues.push('TONCENTER_API_URL');
  } else {
    try {
      const endpoint = new URL(env.TONCENTER_API_URL);
      if (endpoint.protocol !== 'https:') issues.push('TONCENTER_API_URL=https');
      if (endpoint.hostname.toLowerCase().includes('testnet')) {
        issues.push('TONCENTER_API_URL=mainnet endpoint');
      }
    } catch {
      issues.push('TONCENTER_API_URL=valid URL');
    }
  }

  return issues;
}
