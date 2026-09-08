import { describe, it, expect, beforeEach } from 'vitest';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';

describe('ServerRPSEngine Unit Tests', () => {
  let engine: ServerRPSEngine;

  beforeEach(() => {
    engine = new ServerRPSEngine(3); // First to 3 points
  });

  it('should initialize with 0-0 score, round 1, and no match winner', () => {
    const state: any = engine.getState();
    expect(state.p1Score).toBe(0);
    expect(state.p2Score).toBe(0);
    expect(state.roundNumber).toBe(1);
    expect(state.p1HasChosen).toBe(false);
    expect(state.p2HasChosen).toBe(false);
    expect(engine.isGameOver()).toBe(false);
    expect(engine.getWinner()).toBeNull();
  });

  it('should keep first choice secret and unrevealed until opponent commits', () => {
    const p1Commit = engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    expect(p1Commit.success).toBe(true);
    expect(p1Commit.actionType).toBe('RPS_CHOICE_COMMITTED');
    expect(p1Commit.payload.player).toBe('p1');
    expect(p1Commit.revealed).toBe(false);

    const state: any = engine.getState();
    expect(state.p1HasChosen).toBe(true);
    expect(state.p2HasChosen).toBe(false);
    // Secret choices should not be exposed in state
    expect(state.lastP1Choice).toBeNull();
    expect(state.lastP2Choice).toBeNull();
  });

  it('should resolve round and increment score when both players commit (Rock beats Scissors)', () => {
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    const p2Commit = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });

    expect(p2Commit.success).toBe(true);
    expect(p2Commit.actionType).toBe('RPS_ROUND_RESOLVED');
    expect(p2Commit.revealed).toBe(true);
    expect(p2Commit.payload.p1Choice).toBe('rock');
    expect(p2Commit.payload.p2Choice).toBe('scissors');
    expect(p2Commit.payload.roundWinner).toBe('p1');
    expect(p2Commit.payload.p1Score).toBe(1);
    expect(p2Commit.payload.p2Score).toBe(0);

    const state: any = engine.getState();
    expect(state.p1Score).toBe(1);
    expect(state.p2Score).toBe(0);
    expect(state.roundNumber).toBe(2);
    expect(state.p1HasChosen).toBe(false); // Reset for next round
    expect(state.p2HasChosen).toBe(false);
  });

  it('should award round to P2 when Scissors beats Paper', () => {
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'paper' });
    const res = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });

    expect(res.payload.roundWinner).toBe('p2');
    expect(res.payload.p1Score).toBe(0);
    expect(res.payload.p2Score).toBe(1);
  });

  it('should award round to P1 when Paper beats Rock', () => {
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'paper' });
    const res = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'rock' });

    expect(res.payload.roundWinner).toBe('p1');
    expect(res.payload.p1Score).toBe(1);
    expect(res.payload.p2Score).toBe(0);
  });

  it('should handle draw rounds when both choose the same weapon', () => {
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    const res = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'rock' });

    expect(res.payload.roundWinner).toBe('draw');
    expect(res.payload.p1Score).toBe(0);
    expect(res.payload.p2Score).toBe(0);
    expect(res.payload.round).toBe(1);
    expect(res.payload.nextRound).toBe(2);
  });

  it('should declare match winner when a player reaches max points (first to 3)', () => {
    // Round 1: P1 wins
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });

    // Round 2: P1 wins
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });

    // Round 3: P1 wins -> 3 points
    engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    const finalRes = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });

    expect(finalRes.isGameOver).toBe(true);
    expect(finalRes.winner).toBe('p1');
    expect(finalRes.payload.matchWinner).toBe('p1');
    expect(engine.isGameOver()).toBe(true);
    expect(engine.getWinner()).toBe('p1');
  });

  it('should reject invalid choice payloads', () => {
    expect(engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'dynamite' as any }).success).toBe(false);
    expect(engine.handleAction('p1', 'CHOOSE_RPS', { choice: '' as any }).success).toBe(false);
    expect(engine.handleAction('p1', 'CHOOSE_RPS', {}).success).toBe(false);
  });

  it('should reject moves after match is over', () => {
    const stateAny = engine as any;
    stateAny.state.matchWinner = 'p1';

    const result = engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already ended');
  });

  it('should reject unsupported action types', () => {
    const result = engine.handleAction('p1', 'ROLL_DICE');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported action type');
  });
});
