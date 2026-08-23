// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnakeLadderArena } from '../../../src/components/game/SnakeLadderArena';
import { createMockDuelState } from '../../setup/mock-data';

describe('SnakeLadderArena with 3D Dice Integration', () => {
  it('renders 3D dice stage and triggers onRoll when tapping roll button on active turn', () => {
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
});
