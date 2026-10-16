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
          validUntil: expect.any(Number),
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

  it('does not mark a pending deposit credited after an unrelated balance increase', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockResolvedValueOnce({ boc: 'test_boc_hash' });

    const submitDeposit = vi.fn().mockResolvedValue(undefined);
    const view = render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} initialTransactions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/Deposit In Progress/i)).toBeInTheDocument();
    view.rerender(<BankScreen balance={12.45} onSubmitDeposit={submitDeposit} initialTransactions={[]} />);

    expect(screen.getByText(/Deposit In Progress/i)).toBeInTheDocument();
    expect(screen.queryByText(/Deposit Credited/i)).not.toBeInTheDocument();
  });

  it('marks a deposit credited only after its matching ledger entry arrives', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockResolvedValueOnce({ boc: 'test_boc_hash' });

    const submitDeposit = vi.fn().mockResolvedValue(undefined);
    const view = render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} initialTransactions={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));
    expect(await screen.findByText(/Deposit In Progress/i)).toBeInTheDocument();

    view.rerender(<BankScreen
      balance={2.95}
      onSubmitDeposit={submitDeposit}
      initialTransactions={[{
        id: 'ledger-deposit-1',
        type: 'deposit',
        amount: 0.5,
        timestamp: new Date().toISOString(),
        description: 'Gram deposit on TON',
        status: 'confirmed',
        depositIntentId: 'intent_123',
      }]}
    />);

    expect(await screen.findByText(/Deposit Credited/i)).toBeInTheDocument();
    expect(screen.getByText(/Balance credited!/i)).toBeInTheDocument();
  });

  it('shows a recoverable error when the server rejects a signed deposit', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockResolvedValueOnce({ boc: 'test_boc_hash' });

    const submitDeposit = vi.fn().mockRejectedValue(new Error('DEPOSIT_INTENT_EXPIRED'));
    render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/submission was not confirmed: DEPOSIT_INTENT_EXPIRED/i)).toBeInTheDocument();
    expect(screen.queryByText(/Deposit In Progress/i)).not.toBeInTheDocument();
    expect(multiplayerService.cancelDepositIntent).not.toHaveBeenCalled();
  });

  it('associates bank amount inputs with their visible labels', () => {
    render(<BankScreen balance={5.0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));

    expect(screen.getByLabelText('Deposit Amount:')).toBeInTheDocument();
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

  it('shows an expired outcome instead of an endless confirmation spinner', async () => {
    const activeDeposit = {
      id: 'expired_dep_1',
      amountGram: 2.5,
      amountNano: '2500000000',
      status: 'pending',
      createdAt: new Date(Date.now() - 700_000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      boc: 'sample_boc_abc',
    };

    render(<BankScreen balance={10.0} activeDeposit={activeDeposit} />);

    expect(await screen.findByText(/Deposit Expired/i)).toBeInTheDocument();
    expect(screen.getByText(/No funds were credited/i)).toBeInTheDocument();
    expect(screen.getByText(/Check your transaction history/i)).toBeInTheDocument();
  });

  it('shows the server fee quote before confirming a mainnet Gram withdrawal', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };

    const requestQuote = vi.fn().mockResolvedValue({
      quoteId: 'f4b12ac8-1c11-4c4a-af8e-11dd9ba0a712',
      walletAddress: mockAddress,
      grossAmountNano: '1000000000',
      feeNano: '1000000',
      netAmountNano: '999000000',
      network: 'mainnet',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const confirmWithdrawal = vi.fn().mockResolvedValue({ id: 'withdrawal-1', status: 'pending' });
    render(<BankScreen balance={5.0} onRequestWithdrawalQuote={requestQuote} onConfirmWithdrawal={confirmWithdrawal} />);

    // Open withdraw panel
    const withdrawBtn = screen.getByRole('button', { name: 'Withdraw' });
    fireEvent.click(withdrawBtn);

    // The form's Withdraw button requests and displays the server-generated fee quote.
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => {
      expect(requestQuote).toHaveBeenCalledWith({
        walletAddress: mockAddress,
        amountNano: '1000000000',
      });
    });
    expect(await screen.findByText(/Review your Gram withdrawal/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.001 GRAM/i)).toBeInTheDocument();
    expect(confirmWithdrawal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirm withdrawal/i }));
    await waitFor(() => expect(confirmWithdrawal).toHaveBeenCalledWith('f4b12ac8-1c11-4c4a-af8e-11dd9ba0a712'));
    expect(await screen.findByText(/is pending on TON Mainnet/i)).toBeInTheDocument();
  });

  it('does not request a deposit intent before the user connects a wallet', async () => {
    render(<BankScreen balance={2.45} onSubmitDeposit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findAllByText(/Connect your TON wallet to deposit/i)).toHaveLength(2);
    expect(mockOpenModal).toHaveBeenCalled();
    expect(multiplayerService.requestDepositIntent).not.toHaveBeenCalled();
  });

  it('blocks deposits when the configured asset mode is not native TON', async () => {
    vi.stubEnv('VITE_TON_ASSET_MODE', 'jetton');
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    render(<BankScreen balance={2.45} onSubmitDeposit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/Deposits are temporarily unavailable/i)).toBeInTheDocument();
    expect(multiplayerService.requestDepositIntent).not.toHaveBeenCalled();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('blocks deposits when the TON network is missing or unsupported', async () => {
    vi.stubEnv('VITE_TON_NETWORK', 'unknown');
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    render(<BankScreen balance={2.45} onSubmitDeposit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/Deposits are temporarily unavailable/i)).toBeInTheDocument();
    expect(multiplayerService.requestDepositIntent).not.toHaveBeenCalled();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('blocks deposits when the vault address is not configured', async () => {
    vi.stubEnv('VITE_SYSTEM_DEPOSIT_ADDRESS', '');
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    render(<BankScreen balance={2.45} onSubmitDeposit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/Deposits are temporarily unavailable/i)).toBeInTheDocument();
    expect(multiplayerService.requestDepositIntent).not.toHaveBeenCalled();
  });

  it('shows the server error and does not open the wallet when deposit intent creation fails', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    vi.mocked(multiplayerService.requestDepositIntent).mockRejectedValueOnce(new Error('Deposit service unavailable'));
    render(<BankScreen balance={2.45} onSubmitDeposit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText('Deposit service unavailable')).toBeInTheDocument();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('cancels a draft intent when the server omits the required memo', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    vi.mocked(multiplayerService.requestDepositIntent).mockResolvedValueOnce({
      intentId: 'incomplete-intent', memo: '', depositAddress: 'EQDgibousVaultAddressForComponentTest12345',
      amountNano: '500000000', expiresAt: new Date(Date.now() + 600000).toISOString(),
    } as any);
    render(<BankScreen balance={2.45} onSubmitDeposit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/Server failed to provide a valid deposit memo/i)).toBeInTheDocument();
    await waitFor(() => expect(multiplayerService.cancelDepositIntent).toHaveBeenCalledWith('incomplete-intent'));
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('cancels an intent when the wallet returns without a signed BOC', async () => {
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockResolvedValueOnce({});
    const submitDeposit = vi.fn();
    render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.click(screen.getByRole('button', { name: /Deposit .* GRAM/i }));

    expect(await screen.findByText(/Deposit was not signed/i)).toBeInTheDocument();
    await waitFor(() => expect(multiplayerService.cancelDepositIntent).toHaveBeenCalledWith('intent_123'));
    expect(submitDeposit).not.toHaveBeenCalled();
  });

  it('sends an exact custom decimal deposit amount on TON Testnet', async () => {
    vi.stubEnv('VITE_TON_NETWORK', 'testnet');
    mockAddress = 'EQD48x9_ton_player_wallet_address_12345';
    mockWallet = { device: { appName: 'Telegram Wallet' }, account: { address: mockAddress } };
    mockSendTransaction.mockResolvedValueOnce({ boc: 'testnet-boc' });
    const submitDeposit = vi.fn().mockResolvedValue(undefined);
    render(<BankScreen balance={2.45} onSubmitDeposit={submitDeposit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    fireEvent.change(screen.getByLabelText('Deposit Amount:'), { target: { value: '1.23456789' } });
    fireEvent.click(screen.getByRole('button', { name: /Deposit 1\.23456789 GRAM/i }));

    await waitFor(() => expect(mockSendTransaction).toHaveBeenCalledWith(expect.objectContaining({ network: '-3' })));
    await waitFor(() => expect(submitDeposit).toHaveBeenCalledWith(expect.objectContaining({
      amountNano: '1234567890', network: 'testnet', boc: 'testnet-boc',
    })));
  });

  it('requires a recipient address before requesting a withdrawal quote', async () => {
    const requestQuote = vi.fn();
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)!);

    expect(await screen.findByText(/Connect your wallet or enter a recipient TON address/i)).toBeInTheDocument();
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('trims a manually entered recipient address before requesting a quote', async () => {
    const requestQuote = vi.fn().mockResolvedValue({
      quoteId: 'trimmed-recipient-quote', walletAddress: 'EQBrecipient123456789012345',
      grossAmountNano: '1000000000', feeNano: '1000000', netAmountNano: '999000000',
      network: 'mainnet', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Recipient TON Address:'), { target: { value: '  EQBrecipient123456789012345  ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)!);

    await waitFor(() => expect(requestQuote).toHaveBeenCalledWith({
      walletAddress: 'EQBrecipient123456789012345', amountNano: '1000000000',
    }));
  });

  it('preserves a withdrawal request error so the user can correct or retry', async () => {
    const requestQuote = vi.fn().mockRejectedValue(new Error('Withdrawal limit exceeded'));
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Recipient TON Address:'), { target: { value: 'EQBrecipient123456789012345' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)!);

    expect(await screen.findByText('Withdrawal limit exceeded')).toBeInTheDocument();
    expect(screen.queryByText(/Review your Gram withdrawal/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
  });

  it('does not confirm an expired withdrawal quote', async () => {
    const requestQuote = vi.fn().mockResolvedValue({
      quoteId: 'expired-quote', walletAddress: 'EQBrecipient123456789012345',
      grossAmountNano: '1000000000', feeNano: '1000000', netAmountNano: '999000000',
      network: 'mainnet', expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const confirmWithdrawal = vi.fn();
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} onConfirmWithdrawal={confirmWithdrawal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Recipient TON Address:'), { target: { value: 'EQBrecipient123456789012345' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)!);
    fireEvent.click(await screen.findByRole('button', { name: /Confirm withdrawal/i }));

    expect(await screen.findByText(/This fee quote expired/i)).toBeInTheDocument();
    expect(confirmWithdrawal).not.toHaveBeenCalled();
    expect(screen.queryByText(/Review your Gram withdrawal/i)).not.toBeInTheDocument();
  });

  it('keeps a quote available to retry after withdrawal confirmation fails', async () => {
    const requestQuote = vi.fn().mockResolvedValue({
      quoteId: 'retry-quote', walletAddress: 'EQBrecipient123456789012345',
      grossAmountNano: '1000000000', feeNano: '1000000', netAmountNano: '999000000',
      network: 'mainnet', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const confirmWithdrawal = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary server error'))
      .mockResolvedValueOnce({ id: 'withdrawal-retry-1', status: 'pending' });
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} onConfirmWithdrawal={confirmWithdrawal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Recipient TON Address:'), { target: { value: 'EQBrecipient123456789012345' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)!);
    fireEvent.click(await screen.findByRole('button', { name: /Confirm withdrawal/i }));

    expect(await screen.findByText('Temporary server error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm withdrawal/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirm withdrawal/i }));

    await waitFor(() => expect(confirmWithdrawal).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/is pending on TON Mainnet/i)).toBeInTheDocument();
  });

  it('uses the 100 percent quick-select amount when requesting a withdrawal quote', async () => {
    const requestQuote = vi.fn().mockResolvedValue({
      quoteId: 'full-balance-quote', walletAddress: 'EQDrecipient123456789012345',
      grossAmountNano: '5000000000', feeNano: '1000000', netAmountNano: '4999000000',
      network: 'mainnet', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Recipient TON Address:'), { target: { value: 'EQDrecipient123456789012345' } });
    fireEvent.click(screen.getByRole('button', { name: /100% Max/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)!);

    await waitFor(() => expect(requestQuote).toHaveBeenCalledWith({
      walletAddress: 'EQDrecipient123456789012345', amountNano: '5000000000',
    }));
  });

  it('disables withdrawal quoting for a zero amount', () => {
    const requestQuote = vi.fn();
    render(<BankScreen balance={5} onRequestWithdrawalQuote={requestQuote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Recipient TON Address:'), { target: { value: 'EQDrecipient123456789012345' } });
    fireEvent.change(screen.getByLabelText('Withdraw Amount:'), { target: { value: '0' } });

    expect(screen.getAllByRole('button', { name: 'Withdraw' }).at(-1)).toBeDisabled();
    expect(requestQuote).not.toHaveBeenCalled();
  });
});

