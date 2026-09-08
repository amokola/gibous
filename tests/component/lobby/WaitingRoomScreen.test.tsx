// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaitingRoomScreen } from '../../../src/components/lobby/WaitingRoomScreen';

describe('WaitingRoomScreen Component Tests', () => {
  const defaultProps = {
    roomCode: 'TEST88',
    gameType: 'snake' as const,
    stake: 100,
    hostName: 'Alice',
    hostAvatar: '',
    onCancel: vi.fn(),
  };

  it('should render room code, host information, and total duel pot', () => {
    render(<WaitingRoomScreen {...defaultProps} />);

    expect(screen.getByText('TEST88')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/SNAKES & LADDERS/i)).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument(); // Pot is 100 * 2
  });

  it('should copy room code to clipboard when copy button is clicked', () => {
    render(<WaitingRoomScreen {...defaultProps} />);

    const copyBtn = screen.getByTitle(/Copy room code/i);
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TEST88');
    expect(screen.getByText(/Copied!/i)).toBeInTheDocument();
  });

  it('should call onCancel when Cancel Duel button is clicked', () => {
    render(<WaitingRoomScreen {...defaultProps} />);

    const cancelBtn = screen.getByRole('button', { name: /CANCEL DUEL/i });
    fireEvent.click(cancelBtn);

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('should open Telegram share intent when clicking Invite Opponent', () => {
    const openMock = vi.fn();
    window.open = openMock;

    render(<WaitingRoomScreen {...defaultProps} />);

    const inviteBtn = screen.getByRole('button', { name: /INVITE OPPONENT/i });
    fireEvent.click(inviteBtn);

    expect(openMock).toHaveBeenCalledWith(expect.stringContaining('https://t.me/share/url'), '_blank');
  });
});
