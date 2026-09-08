// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    fireEvent.click(rockBtn);

    expect(onChooseRPS).toHaveBeenCalledWith('rock');
    expect(screen.getByText(/YOUR CHOICE: rock/i)).toBeInTheDocument();
  });
});
