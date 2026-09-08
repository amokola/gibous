// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnakeLadderArena } from '../../../src/components/game/SnakeLadderArena';
import { createMockDuelState } from '../../setup/mock-data';

describe('SnakeLadderArena with Deterministic Board & 3D Dice Integration', () => {
  it('renders 10x10 board with Start (1) and Finish (100) tiles and tactile pawns', () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Position: 1,
        p2Position: 1,
        lastRoll: null,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    // Board tiles
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    // Pawns
    expect(screen.getByTitle('Player 1')).toBeInTheDocument();
    expect(screen.getByTitle('Player 2')).toBeInTheDocument();

    // 3D Dice stage
    expect(screen.getByTestId('dice-3d-stage')).toBeInTheDocument();
  });

  it('triggers onRoll when tapping roll button on active turn', () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Position: 10,
        p2Position: 5,
        lastRoll: 4,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    expect(screen.getByTestId('dice-3d-stage')).toBeInTheDocument();

    const rollBtn = screen.getByRole('button', { name: /ROLL DICE/i });
    expect(rollBtn).not.toBeDisabled();

    fireEvent.click(rollBtn);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('disables roll button when it is opponent turn', () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p2',
      gameState: {
        p1Position: 10,
        p2Position: 5,
        lastRoll: 4,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    const rollBtn = screen.getByRole('button', { name: /WAITING FOR OPPONENT/i });
    expect(rollBtn).toBeDisabled();

    fireEvent.click(rollBtn);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('triggers 3D dice animation when incoming server dice event arrives', async () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p2',
      lastDiceEvent: {
        player: 'p2',
        value: 5,
        from: 1,
        to: 6,
        version: 2,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    expect(screen.getByTestId('dice-3d-stage')).toBeInTheDocument();
  });

  it('reconciles cleanly when gameState positions advance', () => {
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Position: 25,
        p2Position: 12,
        lastRoll: 6,
      },
    });

    const { rerender } = render(<SnakeLadderArena duelState={duelState} onRoll={vi.fn()} />);
    expect(screen.getByTitle('Player 1')).toBeInTheDocument();

    const updatedState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p2',
      gameState: {
        p1Position: 31,
        p2Position: 12,
        lastRoll: 6,
      },
    });

    rerender(<SnakeLadderArena duelState={updatedState} onRoll={vi.fn()} />);
    expect(screen.getByTitle('Player 1')).toBeInTheDocument();
  });

  it('displays tile 100 finish banner and disables roll button when match ends', () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      winner: 'p1',
      gameState: {
        p1Position: 100,
        p2Position: 84,
        lastRoll: 4,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    expect(screen.getByText(/YOU REACHED TILE 100! 👑/i)).toBeInTheDocument();

    const rollBtn = screen.getByRole('button', { name: /TILE 100 REACHED — MATCH OVER/i });
    expect(rollBtn).toBeDisabled();

    fireEvent.click(rollBtn);
    expect(onRoll).not.toHaveBeenCalled();
  });
});
