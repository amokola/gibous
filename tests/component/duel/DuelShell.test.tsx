// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuelShell } from '../../../src/components/duel/DuelShell';
import { createMockDuelState } from '../../setup/mock-data';

describe('DuelShell Component Tests', () => {
  it('should render header with players, pot chip, turn banner, and emote buttons', () => {
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      potAmount: 200,
      stakeAmount: 100,
    });

    const onLeave = vi.fn();
    const onSendEmote = vi.fn();

    render(
      <DuelShell
        duelState={duelState}
        onLeave={onLeave}
        onSendEmote={onSendEmote}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div data-testid="game-arena-child">Mock Arena</div>
      </DuelShell>
    );

    expect(screen.getByTestId('game-arena-child')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument(); // Pot chip
    expect(screen.getByText(/YOUR TURN • MAKE YOUR MOVE/i)).toBeInTheDocument();

    // Click an emote button
    const fireEmote = screen.getByRole('button', { name: '🔥' });
    fireEvent.click(fireEmote);
    expect(onSendEmote).toHaveBeenCalledWith('🔥');
  });

  it('should open and handle surrender confirmation modal when clicking back button', () => {
    const duelState = createMockDuelState();
    const onLeave = vi.fn();

    render(
      <DuelShell
        duelState={duelState}
        onLeave={onLeave}
        onSendEmote={vi.fn()}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    // Click back button
    const backBtn = screen.getByTitle(/Leave duel/i);
    fireEvent.click(backBtn);

    expect(screen.getByText(/SURRENDER DUEL\?/i)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: /SURRENDER DUEL/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const stayButton = screen.getByRole('button', { name: /STAY & PLAY/i });
    const forfeitBtn = screen.getByRole('button', { name: /FORFEIT/i });
    expect(stayButton).toHaveFocus();
    forfeitBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(stayButton).toHaveFocus();
    stayButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(forfeitBtn).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(backBtn).toHaveFocus();

    fireEvent.click(backBtn);

    // Click forfeit
    fireEvent.click(screen.getByRole('button', { name: /FORFEIT/i }));

    expect(onLeave).toHaveBeenCalled();
  });

  it('should display disconnect overlay when opponent is disconnected', () => {
    const duelState = createMockDuelState();

    render(
      <DuelShell
        duelState={duelState}
        onLeave={vi.fn()}
        onSendEmote={vi.fn()}
        opponentDisconnected={true}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    expect(screen.getAllByText(/OPPONENT DISCONNECTED/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/45/i).length).toBeGreaterThanOrEqual(1);
  });

  it('should display victory banner when match is over and player won', () => {
    const duelState = createMockDuelState({
      room: { code: 'DUEL1', gameType: 'snake', status: 'gameover', version: 5 },
      myRole: 'p1',
      winner: 'p1',
    });

    render(
      <DuelShell
        duelState={duelState}
        onLeave={vi.fn()}
        onSendEmote={vi.fn()}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    expect(screen.getByText(/VICTORY! YOU WON THE MATCH!/i)).toBeInTheDocument();
  });

  it('should display opponent victory banner when match is over and opponent won', () => {
    const duelState = createMockDuelState({
      room: { code: 'DUEL1', gameType: 'snake', status: 'gameover', version: 5 },
      myRole: 'p1',
      winner: 'p2',
      players: {
        p1: { id: 'p1', name: 'Alice', color: 'green', isReady: true, isConnected: true },
        p2: { id: 'p2', name: 'Bob', color: 'blue', isReady: true, isConnected: true },
      },
    });

    render(
      <DuelShell
        duelState={duelState}
        onLeave={vi.fn()}
        onSendEmote={vi.fn()}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    expect(screen.getByText(/BOB WON THE MATCH!/i)).toBeInTheDocument();
  });

  it('should display draw banner when match ends in a draw', () => {
    const duelState = createMockDuelState({
      room: { code: 'DUEL1', gameType: 'connect4', status: 'gameover', version: 5 },
      myRole: 'p1',
      winner: 'draw',
    });

    render(
      <DuelShell
        duelState={duelState}
        onLeave={vi.fn()}
        onSendEmote={vi.fn()}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    expect(screen.getByText(/MATCH ENDED IN A DRAW!/i)).toBeInTheDocument();
  });

  it('should display simultaneous waiting banner for spectators during RPS', () => {
    const duelState = createMockDuelState({
      room: { code: 'RPS1', gameType: 'rps', status: 'playing', version: 1 },
      myRole: null, // Spectator
      activePlayer: 'all' as any,
      players: {
        p1: { id: 'p1', name: 'Alice', color: 'green', isReady: true, isConnected: true },
        p2: { id: 'p2', name: 'Bob', color: 'blue', isReady: true, isConnected: true },
      },
      gameState: {
        p1HasChosen: false,
        p2HasChosen: false,
      },
    });

    const { rerender } = render(
      <DuelShell
        duelState={duelState}
        onLeave={vi.fn()}
        onSendEmote={vi.fn()}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    expect(screen.getByText(/WAITING FOR PLAYERS/i)).toBeInTheDocument();

    // Now P1 chooses, still waiting for Bob
    const p1ChosenState = createMockDuelState({
      ...duelState,
      gameState: {
        p1HasChosen: true,
        p2HasChosen: false,
      },
    });

    rerender(
      <DuelShell
        duelState={p1ChosenState}
        onLeave={vi.fn()}
        onSendEmote={vi.fn()}
        opponentDisconnected={false}
        opponentReconnected={false}
        disconnectTimeoutMs={45000}
        floatingEmotes={[]}
      >
        <div>Arena</div>
      </DuelShell>
    );

    expect(screen.getByText(/WAITING FOR BOB\.\.\./i)).toBeInTheDocument();
  });
});
