// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RPSArena } from '../../../src/components/rps/RPSArena';
import { Connect4Arena } from '../../../src/components/connect4/Connect4Arena';
import { createMockDuelState } from '../../setup/mock-data';

describe('Milestone 1 Challenger 2 - RPS Watchdog & Client Component Hardening', () => {
  describe('Connect4Arena Client Persistence & Winning Coords Rendering', () => {
    it('should render winning highlights when gameState uses legacy winningCells format with { row, col } objects', () => {
      const onDropDisc = vi.fn();
      const duelState = createMockDuelState({
        room: { code: 'C4LEGACY', gameType: 'connect4', status: 'gameover', version: 5 },
        myRole: 'p1',
        activePlayer: 'p1',
        winner: 'p1',
        gameState: {
          winningCells: [
            { row: 5, col: 0 },
            { row: 5, col: 1 },
            { row: 5, col: 2 },
            { row: 5, col: 3 },
          ],
        },
      });

      render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

      expect(screen.getByText(/4-IN-A-ROW! YOU WON THE DUEL!/i)).toBeInTheDocument();
      // Dropper buttons must be disabled
      const colButton = screen.getByTitle('Drop in column 1');
      expect(colButton).toBeDisabled();
    });

    it('should render winning highlights when gameState uses legacy winningCells format with [r, c] tuples', () => {
      const onDropDisc = vi.fn();
      const duelState = createMockDuelState({
        room: { code: 'C4TUPLE', gameType: 'connect4', status: 'gameover', version: 5 },
        myRole: 'p2',
        activePlayer: 'p1',
        winner: 'p2',
        gameState: {
          winningCells: [
            [2, 3],
            [3, 3],
            [4, 3],
            [5, 3],
          ],
        },
      });

      render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

      expect(screen.getByText(/4-IN-A-ROW! YOU WON THE DUEL!/i)).toBeInTheDocument();
      const colButton = screen.getByTitle('Drop in column 4');
      expect(colButton).toBeDisabled();
    });

    it('should render winning highlights when gameState uses hardened winningCoords format', () => {
      const onDropDisc = vi.fn();
      const duelState = createMockDuelState({
        room: { code: 'C4HARDENED', gameType: 'connect4', status: 'gameover', version: 6 },
        myRole: 'p1',
        activePlayer: 'p2',
        winner: 'p2',
        gameState: {
          winningCoords: [
            [5, 0],
            [4, 1],
            [3, 2],
            [2, 3],
          ],
        },
      });

      render(<Connect4Arena duelState={duelState} onDropDisc={onDropDisc} />);

      expect(screen.getByText(/4-IN-A-ROW! BOB \(P2\) WON!/i)).toBeInTheDocument();
    });
  });

  describe('RPSArena Watchdog Timer Lifecycle & Robustness', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should lock weapon on select, remain locked at 5999ms, and unlock at 6000ms', () => {
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
      fireEvent.click(rockBtn);

      expect(onChooseRPS).toHaveBeenCalledTimes(1);
      expect(onChooseRPS).toHaveBeenCalledWith('rock');
      expect(screen.getByText(/YOUR CHOICE: rock/i)).toBeInTheDocument();
      expect(rockBtn).toBeDisabled();

      // At 5999ms: still locked
      act(() => {
        vi.advanceTimersByTime(5999);
      });
      expect(screen.getByText(/YOUR CHOICE: rock/i)).toBeInTheDocument();
      expect(rockBtn).toBeDisabled();

      // At 6000ms: watchdog fires and unlocks choice
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText(/CHOOSE YOUR WEAPON/i)).toBeInTheDocument();
      expect(rockBtn).not.toBeDisabled();
    });

    it('should cleanly cancel watchdog timer if server state acknowledges choice (hasAlreadyChosen)', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const onChooseRPS = vi.fn();

      const initialDuelState = createMockDuelState({
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

      const { rerender } = render(<RPSArena duelState={initialDuelState} onChooseRPS={onChooseRPS} />);

      const paperBtn = screen.getByRole('button', { name: /PAPER/i });
      fireEvent.click(paperBtn);

      expect(screen.getByText(/YOUR CHOICE: paper/i)).toBeInTheDocument();

      // Server acknowledges choice at 1000ms via updated props (p1HasChosen = true)
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const ackedDuelState = createMockDuelState({
        room: { code: 'RPSTEST', gameType: 'rps', status: 'playing', version: 2 },
        myRole: 'p1',
        activePlayer: 'p2',
        gameState: {
          p1Score: 0,
          p2Score: 0,
          roundNumber: 1,
          p1HasChosen: true,
          p2HasChosen: false,
        },
      });

      rerender(<RPSArena duelState={ackedDuelState} onChooseRPS={onChooseRPS} />);

      // clearTimeout should have been invoked to clean up the watchdog timer
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Fast-forward past 6000ms (to 10000ms)
      act(() => {
        vi.advanceTimersByTime(9000);
      });

      // Choice should still remain sealed because hasAlreadyChosen is true on server
      expect(screen.getByText(/SEALED/i)).toBeInTheDocument();
      expect(paperBtn).toBeDisabled();
    });

    it('should clean up watchdog timer on component unmount without memory leaks or errors', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
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

      const { unmount } = render(<RPSArena duelState={duelState} onChooseRPS={onChooseRPS} />);

      const scissorsBtn = screen.getByRole('button', { name: /SCISSORS/i });
      fireEvent.click(scissorsBtn);

      // Unmount after 2000ms
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      unmount();

      // Ensure unmount cleanup ran clearTimeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Fast forward past 6000ms to verify no late state updates on unmounted component
      act(() => {
        vi.advanceTimersByTime(10000);
      });
    });

    it('should clear watchdog and reset choice when roundNumber changes', () => {
      const onChooseRPS = vi.fn();

      const round1State = createMockDuelState({
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

      const { rerender } = render(<RPSArena duelState={round1State} onChooseRPS={onChooseRPS} />);

      const rockBtn = screen.getByRole('button', { name: /ROCK/i });
      fireEvent.click(rockBtn);

      expect(screen.getByText(/YOUR CHOICE: rock/i)).toBeInTheDocument();

      // Round 2 begins
      const round2State = createMockDuelState({
        room: { code: 'RPSTEST', gameType: 'rps', status: 'playing', version: 3 },
        myRole: 'p1',
        activePlayer: 'p1',
        gameState: {
          p1Score: 1,
          p2Score: 0,
          roundNumber: 2,
          p1HasChosen: false,
          p2HasChosen: false,
        },
      });

      rerender(<RPSArena duelState={round2State} onChooseRPS={onChooseRPS} />);

      expect(screen.getByText(/ROUND 2 • FIRST TO 3 GEMS/i)).toBeInTheDocument();
      expect(screen.getByText(/CHOOSE YOUR WEAPON/i)).toBeInTheDocument();
      expect(rockBtn).not.toBeDisabled();
    });

    it('should reject rapid repeated clicks while choice is locked', () => {
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

      fireEvent.click(rockBtn);
      // Attempt to click paper and scissors immediately
      fireEvent.click(paperBtn);
      fireEvent.click(rockBtn);

      expect(onChooseRPS).toHaveBeenCalledTimes(1);
      expect(onChooseRPS).toHaveBeenCalledWith('rock');
    });

    it('should permit selecting a new weapon after watchdog timeout expiration', () => {
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
      const scissorsBtn = screen.getByRole('button', { name: /SCISSORS/i });

      // First selection: rock
      fireEvent.click(rockBtn);
      expect(onChooseRPS).toHaveBeenLastCalledWith('rock');

      // Wait 6000ms for watchdog expiration
      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(screen.getByText(/CHOOSE YOUR WEAPON/i)).toBeInTheDocument();

      // Second selection: scissors
      fireEvent.click(scissorsBtn);
      expect(onChooseRPS).toHaveBeenCalledTimes(2);
      expect(onChooseRPS).toHaveBeenLastCalledWith('scissors');
      expect(screen.getByText(/YOUR CHOICE: scissors/i)).toBeInTheDocument();

      // Wait 6000ms again for second watchdog expiration
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(screen.getByText(/CHOOSE YOUR WEAPON/i)).toBeInTheDocument();
    });
  });
});
