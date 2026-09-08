// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Connect4Arena } from '../../../src/components/connect4/Connect4Arena';
import { createMockDuelState } from '../../setup/mock-data';

describe('Connect4Arena Component Tests', () => {
  it('should render 7 dropper buttons and trigger onDropDisc when clicked on active turn', () => {
    const onDropDisc = vi.fn();
    const duelState = createMockDuelState({
      room: { code: 'C4TEST', gameType: 'connect4', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p1',
    });

    render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

    expect(screen.getByText(/TAP A COLUMN TO DROP YOUR DISC/i)).toBeInTheDocument();

    const col3Button = screen.getByTitle('Drop in column 3');
    fireEvent.click(col3Button);

    expect(onDropDisc).toHaveBeenCalledWith(2); // 0-indexed column 2 (column 3)
  });

  it('should disable dropper buttons when it is not user turn', () => {
    const onDropDisc = vi.fn();
    const duelState = createMockDuelState({
      room: { code: 'C4TEST', gameType: 'connect4', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p2', // Opponent turn
    });

    render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

    expect(screen.getByText(/WAITING FOR OPPONENT'S MOVE/i)).toBeInTheDocument();

    const col1Button = screen.getByTitle('Drop in column 1');
    expect(col1Button).toBeDisabled();

    fireEvent.click(col1Button);
    expect(onDropDisc).not.toHaveBeenCalled();
  });

  it('should display winning callout and disable dropper buttons when game is over', () => {
    const onDropDisc = vi.fn();
    const duelState = createMockDuelState({
      room: { code: 'C4TEST', gameType: 'connect4', status: 'gameover', version: 2 },
      myRole: 'p1',
      activePlayer: 'p1',
      winner: 'p1',
      gameState: {
        winningCells: [[0, 0], [0, 1], [0, 2], [0, 3]],
      },
    });

    render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

    expect(screen.getByText(/4-IN-A-ROW! YOU WON THE DUEL!/i)).toBeInTheDocument();

    const col1Button = screen.getByTitle('Drop in column 1');
    expect(col1Button).toBeDisabled();

    fireEvent.click(col1Button);
    expect(onDropDisc).not.toHaveBeenCalled();
  });
});
