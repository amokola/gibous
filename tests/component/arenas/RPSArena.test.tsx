// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RPSArena } from '../../../src/components/rps/RPSArena';
import { createMockDuelState } from '../../setup/mock-data';

describe('RPSArena Component Tests', () => {
  it('should render rock, paper, scissors options and trigger onChooseRPS when clicked', () => {
    const onChooseRPS = vi.fn();
    const duelState = createMockDuelState({
      room: { code: 'RPSTEST', gameType: 'rps', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Score: 1,
        p2Score: 0,
        roundNumber: 2,
      },
    });

    render(<RPSArena duelState={duelState} onChooseRPS={onChooseRPS} />);

    expect(screen.getByText(/ROUND 2 • FIRST TO 3 GEMS/i)).toBeInTheDocument();
    expect(screen.getByText('ROCK')).toBeInTheDocument();
    expect(screen.getByText('PAPER')).toBeInTheDocument();
    expect(screen.getByText('SCISSORS')).toBeInTheDocument();

    const rockBtn = screen.getByRole('button', { name: /ROCK/i });
    expect(rockBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(rockBtn);

    expect(onChooseRPS).toHaveBeenCalledWith('rock');
    expect(screen.getByText(/YOUR CHOICE: rock/i)).toBeInTheDocument();
    expect(rockBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('should unlock choice buttons after 6000ms watchdog timeout when acknowledgment is lost', () => {
    vi.useFakeTimers();
    const onChooseRPS = vi.fn();
    const duelState = createMockDuelState({
      room: { code: 'RPSTEST', gameType: 'rps', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Score: 0,
        p2Score: 0,
        roundNumber: 1,
        p1HasChosen: false,
        p2HasChosen: false,
      },
    });

    render(<RPSArena duelState={duelState} onChooseRPS={onChooseRPS} />);

    const rockBtn = screen.getByRole('button', { name: /ROCK/i });
    const paperBtn = screen.getByRole('button', { name: /PAPER/i });

    // Lock in choice
    fireEvent.click(rockBtn);
    expect(screen.getByText(/YOUR CHOICE: rock/i)).toBeInTheDocument();
    expect(rockBtn).toBeDisabled();
    expect(paperBtn).toBeDisabled();

    // Fast-forward 6000ms watchdog
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Watchdog should have unlocked buttons
    expect(screen.getByText(/CHOOSE YOUR WEAPON/i)).toBeInTheDocument();
    expect(rockBtn).not.toBeDisabled();
    expect(paperBtn).not.toBeDisabled();

    vi.useRealTimers();
  });

  it('should recover and clear locked choice immediately if onChooseRPS throws error', () => {
    const onChooseRPS = vi.fn().mockImplementation(() => {
      throw new Error('WebSocket connection lost');
    });

    const duelState = createMockDuelState({
      room: { code: 'RPSTEST', gameType: 'rps', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Score: 0,
        p2Score: 0,
        roundNumber: 1,
        p1HasChosen: false,
        p2HasChosen: false,
      },
    });

    render(<RPSArena duelState={duelState} onChooseRPS={onChooseRPS} />);

    const scissorsBtn = screen.getByRole('button', { name: /SCISSORS/i });
    fireEvent.click(scissorsBtn);

    // Should remain unlocked due to error recovery catch
    expect(screen.getByText(/CHOOSE YOUR WEAPON/i)).toBeInTheDocument();
    expect(scissorsBtn).not.toBeDisabled();
  });
});
