// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeScreen } from '../../../src/components/home/HomeScreen';

const { tonConnectModuleLoaded } = vi.hoisted(() => ({
  tonConnectModuleLoaded: vi.fn(),
}));

vi.mock('@tonconnect/ui-react', () => {
  tonConnectModuleLoaded();
  return {
    TonConnectUIProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useTonAddress: () => '',
    useTonWallet: () => null,
    useTonConnectUI: () => [{ openModal: vi.fn(), disconnect: vi.fn(), sendTransaction: vi.fn() }],
  };
});

describe('HomeScreen bank feature loading', () => {
  it('keeps TON Connect out of the initial home screen and loads it when Vault opens', async () => {
    render(
      <HomeScreen
        userName="Test Player"
        balance={1}
        onSelectAndPlayGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Duel Arenas')).toBeInTheDocument();
    expect(tonConnectModuleLoaded).not.toHaveBeenCalled();

    const vaultTab = screen.getAllByRole('button', { name: /Vault/i })
      .find((button) => button.textContent?.trim() === 'Vault');
    expect(vaultTab).toBeDefined();
    fireEvent.click(vaultTab!);

    await waitFor(() => expect(tonConnectModuleLoaded).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Connect TON/i)).toBeInTheDocument();
  });
});
