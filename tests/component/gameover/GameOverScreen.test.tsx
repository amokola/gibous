// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameOverScreen } from '../../../src/components/gameover/GameOverScreen';
import { Player } from '../../../src/types/game';

describe('GameOverScreen Component Tests', () => {
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

  it('should render victory state with +180 prize receipt when P1 wins a 200 pot', () => {
    const onPlayAgain = vi.fn();
    const onBackToLobby = vi.fn();

    render(
      <GameOverScreen
        winnerId="p1"
        p1={p1}
        p2={p2}
        potAmount={200}
        onPlayAgain={onPlayAgain}
        onBackToLobby={onBackToLobby}
      />
    );

    expect(screen.getByText(/★ VICTORY ★/i)).toBeInTheDocument();
    expect(screen.getByText(/You Won The Match!/i)).toBeInTheDocument();
    expect(screen.getByText('+180')).toBeInTheDocument();
    expect(screen.getByText(/Gibous 10% Arena Fee: -20 GRAM/i)).toBeInTheDocument();

    const rematchBtn = screen.getByRole('button', { name: /Play Rematch/i });
    fireEvent.click(rematchBtn);
    expect(onPlayAgain).toHaveBeenCalled();

    const lobbyBtns = screen.getAllByRole('button', { name: /Back to Lobby/i });
    fireEvent.click(lobbyBtns[0]);
    expect(onBackToLobby).toHaveBeenCalled();
  });

  it('should render draw state with +95 refund receipt when match ends in draw', () => {
    render(
      <GameOverScreen
        winnerId="draw"
        p1={p1}
        p2={p2}
        potAmount={200}
        onPlayAgain={vi.fn()}
        onBackToLobby={vi.fn()}
      />
    );

    expect(screen.getByText(/MATCH DRAW/i)).toBeInTheDocument();
    expect(screen.getByText(/Match Ended in a Draw!/i)).toBeInTheDocument();
    expect(screen.getByText('+95')).toBeInTheDocument();
  });

  it('should render defeat/runner-up state for P2 when P1 wins', () => {
    render(
      <GameOverScreen
        winnerId="p1"
        myRole="p2"
        p1={p1}
        p2={p2}
        potAmount={200}
        onPlayAgain={vi.fn()}
        onBackToLobby={vi.fn()}
      />
    );

    expect(screen.getAllByText(/RUNNER UP/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: /Alice Won The Match/i })).toBeInTheDocument();
    expect(screen.queryByText(/You Won The Match!/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request Rematch/i })).toBeInTheDocument();
  });

  it('should render victory state for P2 when P2 wins', () => {
    render(
      <GameOverScreen
        winnerId="p2"
        myRole="p2"
        p1={p1}
        p2={p2}
        potAmount={200}
        onPlayAgain={vi.fn()}
        onBackToLobby={vi.fn()}
      />
    );

    expect(screen.getByText(/★ VICTORY ★/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /You Won The Match!/i })).toBeInTheDocument();
    expect(screen.getByText('+180')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play Rematch/i })).toBeInTheDocument();
  });

  it('should render forfeit victory for P2 when opponent forfeits', () => {
    render(
      <GameOverScreen
        winnerId="p2"
        result={{ type: 'FORFEIT', winner: 'p2', reason: 'resign' }}
        myRole="p2"
        p1={p1}
        p2={p2}
        potAmount={200}
        onPlayAgain={vi.fn()}
        onBackToLobby={vi.fn()}
      />
    );

    expect(screen.getByText(/★ FORFEIT WIN ★/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Opponent Forfeited! You Won!/i })).toBeInTheDocument();
  });

  it('should render forfeit defeat for P2 when P2 forfeits', () => {
    render(
      <GameOverScreen
        winnerId="p1"
        result={{ type: 'FORFEIT', winner: 'p1', reason: 'resign' }}
        myRole="p2"
        p1={p1}
        p2={p2}
        potAmount={200}
        onPlayAgain={vi.fn()}
        onBackToLobby={vi.fn()}
      />
    );

    expect(screen.getAllByText(/FORFEITED/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: /You Forfeited The Match/i })).toBeInTheDocument();
  });
});
