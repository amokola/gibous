// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LobbyScreen } from '../../../src/components/lobby/LobbyScreen';
import { Player } from '../../../src/types/game';

// Mock MultiplayerService for LobbyScreen
const { MockMultiplayerService } = vi.hoisted(() => {
  class MockMultiplayerService {
    static instance = new MockMultiplayerService();
    static getInstance() {
      return MockMultiplayerService.instance;
    }
    connect = vi.fn();
    disconnect = vi.fn();
    send = vi.fn();
    on = vi.fn().mockReturnValue(() => {});
    off = vi.fn();
    getStatus = vi.fn().mockReturnValue('CONNECTED');
    getConnectionState = vi.fn().mockReturnValue('CONNECTED');
    getOpenRooms = vi.fn().mockResolvedValue([]);
  }
  return { MockMultiplayerService };
});

vi.mock('../../../src/services/multiplayerService', () => ({
  MultiplayerService: MockMultiplayerService,
  multiplayerService: MockMultiplayerService.instance,
}));

describe('LobbyScreen Component Tests', () => {
  const p1: Player = {
    id: 'p1',
    name: 'Alice',
    color: 'green',
    avatarUrl: '',
    score: 0,
    isBot: false,
    isReady: true,
  };

  const p2: Player = {
    id: 'p2',
    name: 'Bob',
    color: 'blue',
    avatarUrl: '',
    score: 0,
    isBot: false,
    isReady: true,
  };

  const defaultProps = {
    selectedGame: 'snake' as const,
    onSelectGame: vi.fn(),
    roomCode: '',
    p1,
    p2,
    isReady: true,
    settings: { mode: 'classic' as const, boardSize: 100, winningAmount: 100 },
    onChangeSettings: vi.fn(),
    onStartGame: vi.fn(),
    onShare: vi.fn(),
    onBack: vi.fn(),
  };

  it('should render LobbyScreen with Create Duel and Open Rooms tabs', () => {
    render(<LobbyScreen {...defaultProps} />);

    expect(screen.getByText(/Create Duel/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Rooms/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Choose Game:/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Stake Amount/i)).toBeInTheDocument();
  });

  it('should allow changing stake via preset chips', () => {
    render(<LobbyScreen {...defaultProps} />);

    const preset250 = screen.getByRole('button', { name: '250' });
    fireEvent.click(preset250);

    expect(defaultProps.onChangeSettings).toHaveBeenCalledWith({ winningAmount: 250 });
  });

  it('should expose minus and plus stake controls', () => {
    render(<LobbyScreen {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decrease stake' }));
    expect(defaultProps.onChangeSettings).toHaveBeenCalledWith({ winningAmount: 90 });

    fireEvent.click(screen.getByRole('button', { name: 'Increase stake' }));
    expect(defaultProps.onChangeSettings).toHaveBeenCalledWith({ winningAmount: 100 });
  });

  it('does not render the removed pass and play feature', () => {
    render(<LobbyScreen {...defaultProps} />);

    expect(screen.queryByText(/Pass & Play/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 Players on this Device/i)).not.toBeInTheDocument();
  });

  it('should open stake confirm modal when clicking Create Duel CTA', () => {
    render(<LobbyScreen {...defaultProps} />);

    const createBtn = screen.getByRole('button', { name: /Create SNAKE Duel/i });
    fireEvent.click(createBtn);

    expect(screen.getByText(/Confirm Duel Entry/i)).toBeInTheDocument();
  });

  it('should trigger onCreateDuel when user confirms in StakeConfirmModal', () => {
    const onCreateDuel = vi.fn();
    render(<LobbyScreen {...defaultProps} onCreateDuel={onCreateDuel} />);

    const createBtn = screen.getByRole('button', { name: /Create SNAKE Duel/i });
    fireEvent.click(createBtn);

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Create/i });
    fireEvent.click(confirmBtn);

    expect(onCreateDuel).toHaveBeenCalledWith('snake', 100);
  });
});
