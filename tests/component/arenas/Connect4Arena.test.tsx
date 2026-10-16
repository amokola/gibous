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

  it('should render the single-shell navy playfield with a recessed well for every cell', () => {
    const duelState = createMockDuelState({
      room: { code: 'C4TEST', gameType: 'connect4', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p1',
    });

    const { container } = render(<Connect4Arena duelState={duelState} onDropDisc={vi.fn()} />);

    expect(screen.getByTestId('connect4-board')).toHaveClass('connect4-board-shell', 'bg-[#24466f]');
    expect(screen.getByTestId('connect4-board')).toHaveClass('rounded-none');
    expect(container.querySelector('.connect4-board-face')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.c4-well')).toHaveLength(42);
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
    expect(col1Button).toHaveAttribute('aria-label', 'Drop a blue checker in column 1');

    fireEvent.click(col1Button);
    expect(onDropDisc).not.toHaveBeenCalled();
  });

  it('should mark the hovered column as the active drop target', () => {
    const onDropDisc = vi.fn();
    const duelState = createMockDuelState({
      room: { code: 'C4TEST', gameType: 'connect4', status: 'playing', version: 1 },
      myRole: 'p1',
      activePlayer: 'p1',
    });

    render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

    const col3Button = screen.getByTitle('Drop in column 3');
    fireEvent.mouseEnter(col3Button);

    expect(col3Button).toHaveAttribute('data-active-target', 'true');
    expect(col3Button).toHaveAttribute('aria-label', 'Drop a red checker in column 3');
    expect(col3Button).toHaveTextContent('↓');
    expect(col3Button).not.toHaveTextContent('·');
    expect(screen.getByTestId('connect4-board').querySelectorAll('.c4-column-hovered')).toHaveLength(6);
    expect(screen.getByTestId('connect4-board').querySelector('.c4-drop-preview')).not.toBeInTheDocument();
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
