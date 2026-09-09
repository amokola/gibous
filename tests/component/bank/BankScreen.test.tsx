// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BankScreen } from '../../../src/components/bank/BankScreen';
import { multiplayerService } from '../../../src/services/multiplayerService';

// Mock TON Connect React UI hooks
const mockOpenModal = vi.fn();
const mockDisconnect = vi.fn();
const mockSendTransaction = vi.fn();
let mockAddress = '';
let mockWallet: any = null;

vi.mock('@tonconnect/ui-react', () => ({
  useTonAddress: () => mockAddress,
  useTonWallet: () => mockWallet,
  useTonConnectUI: () => [
    {
      openModal: mockOpenModal,
      disconnect: mockDisconnect,
      sendTransaction: mockSendTransaction,
    },
  ],
  useIsConnectionRestored: () => true,
  TonConnectButton: () => <button data-testid="ton-connect-button">TON Connect</button>,
}));

vi.mock('../../../src/services/multiplayerService', () => ({
  multiplayerService: {
    requestDepositIntent: vi.fn().mockResolvedValue({
      intentId: 'intent_123',
      memo: 'gibous:dep:123',
      depositAddress: 'EQDgibousVaultAddressForComponentTest12345',
      amountNano: '500000000',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    }),
    cancelDepositIntent: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('BankScreen Component with TON Connect & Real GRAM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SYSTEM_DEPOSIT_ADDRESS', 'EQDgibousVaultAddressForComponentTest12345');
    vi.stubEnv('VITE_TON_NETWORK', 'mainnet');
    mockAddress = '';
    mockWallet = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders disconnected TON Connect status and prompts connection', () => {
    render(<BankScreen balance={2.45} onDeposit={vi.fn()} />);

    expect(screen.getByText(/Connect TON/i)).toBeInTheDocument();
    expect(screen.getByText(/2.45/i)).toBeInTheDocument();
    expect(screen.getAllByText(/GRAM/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ON TON').length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Deposit' }).length).toBe(1);
    expect(screen.getAllByRole('button', { name: 'Withdraw' }).length).toBe(1);
    expect(screen.queryByText(/Deposits pending TON verification/i)).not.toBeInTheDocument();
  });

  it('keeps the connect action free of decorative emoji text', () => {
    render(<BankScreen balance={2.45} onDeposit={vi.fn()} />);

    const connectButton = screen.getByRole('button', { name: 'Connect TON' });
    expect(connectButton.textContent?.trim()).toBe('Connect TON');
  });

  it('triggers tonConnectUI.openModal when connect wallet is clicked in disconnected state', () => {
    render(<BankScreen balance={2.45} onDeposit={vi.fn()} />);

    const connectButtons = screen.getAllByRole('button', { name: /Connect TON/i });
    fireEvent.click(connectButtons[0]);

    expect(mockOpenModal).toHaveBeenCalled();
  });

  it('renders connected wallet state with formatted address when wallet is connected', () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };

    render(<BankScreen balance={2.45} onDeposit={vi.fn()} />);

    expect(screen.getByText(/Telegram Wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/EQD48x...2345/i)).toBeInTheDocument();
  });

  it('executes real sendTransaction when depositing with connected wallet', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockResolvedValueOnce({ boc: 'test_boc_hash' });

    const submitDeposit = vi.fn();
    render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} />);

    // Open deposit panel
    const depositCardBtn = screen.getByRole('button', { name: 'Deposit' });
    fireEvent.click(depositCardBtn);

    // Confirm deposit
    const confirmBtn = screen.getByRole('button', { name: /Deposit .* GRAM/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              address: expect.any(String),
              amount: expect.any(String),
            }),
          ],
          network: '-239',
          from: mockAddress,
        })
      );
    });

    await waitFor(() => expect(submitDeposit).toHaveBeenCalledWith(expect.objectContaining({
      walletAddress: mockAddress,
      depositAddress: 'EQDgibousVaultAddressForComponentTest12345',
      amountNano: '500000000',
      boc: 'test_boc_hash',
    })));
  });

  it('handles user transaction rejection gracefully without deducting balance', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockRejectedValueOnce(new Error('User rejected the transaction'));

    const submitDeposit = vi.fn();
    render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} />);

    // Open deposit panel
    const depositCardBtn = screen.getByRole('button', { name: 'Deposit' });
    fireEvent.click(depositCardBtn);

    // Confirm deposit
    const confirmBtn = screen.getByRole('button', { name: /Deposit .* GRAM/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalled();
    });

    expect(submitDeposit).not.toHaveBeenCalled();
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument();
    expect(multiplayerService.cancelDepositIntent).toHaveBeenCalledWith('intent_123');
  });

  it('handles wallet insufficient funds error, shows clear message and cancels intent', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockRejectedValueOnce(new Error('Wallet reported: insufficient balance'));

    const submitDeposit = vi.fn();
    render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} />);

    // Open deposit panel
    const depositCardBtn = screen.getByRole('button', { name: 'Deposit' });
    fireEvent.click(depositCardBtn);

    // Confirm deposit
    const confirmBtn = screen.getByRole('button', { name: /Deposit .* GRAM/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalled();
    });

    expect(submitDeposit).not.toHaveBeenCalled();
    expect(await screen.findByText(/Insufficient TON balance/i)).toBeInTheDocument();
    expect(multiplayerService.cancelDepositIntent).toHaveBeenCalledWith('intent_123');
  });

  it('renders in-flight confirmation stepper when activeDeposit is present', () => {
    const activeDeposit = {
      id: 'active_dep_1',
      amountGram: 2.5,
      amountNano: '2500000000',
      status: 'pending',
      createdAt: new Date().toISOString(),
      boc: 'sample_boc_abc',
    };

    render(<BankScreen balance={10.0} activeDeposit={activeDeposit} />);

    expect(screen.getByText(/Deposit In Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/\+2\.50 GRAM/i)).toBeInTheDocument();
    expect(screen.getByText(/Transaction signed in wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirming on TON blockchain/i)).toBeInTheDocument();
  });

  it('submits withdrawal when destination and amount are valid', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };

    const submitWithdrawal = vi.fn();
    render(<BankScreen balance={5.0} onSubmitWithdrawal={submitWithdrawal} />);

    // Open withdraw panel
    const withdrawBtn = screen.getByRole('button', { name: 'Withdraw' });
    fireEvent.click(withdrawBtn);

    // Click confirm withdraw button
    const confirmWithdrawBtn = screen.getByRole('button', { name: /Withdraw 1 GRAM/i });
    fireEvent.click(confirmWithdrawBtn);

    await waitFor(() => {
      expect(submitWithdrawal).toHaveBeenCalledWith({
        walletAddress: mockAddress,
        amountNano: '1000000000',
      });
    });

    expect(await screen.findByText(/Withdrawal of 1 GRAM submitted/i)).toBeInTheDocument();
  });
});

