export const TON_NETWORK_IDS = {
  mainnet: '-239',
  testnet: '-3',
} as const;

export type TonNetwork = keyof typeof TON_NETWORK_IDS;

export function getTonConnectNetworkId(network: string | undefined): string | null {
  if (network === 'mainnet' || network === 'testnet') return TON_NETWORK_IDS[network];
  return null;
}
