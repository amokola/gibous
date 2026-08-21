import { GameType, PlayerRole, MatchWinner, RPSChoice } from '../../shared';
import { IServerGameEngine, GameActionResult } from './IServerGameEngine';

export interface RPSState {
  p1Score: number;
  p2Score: number;
  p1HasChosen: boolean;
  p2HasChosen: boolean;
  lastP1Choice: RPSChoice | null;
  lastP2Choice: RPSChoice | null;
  lastRoundWinner: 'p1' | 'p2' | 'draw' | null;
  matchWinner: MatchWinner;
  roundNumber: number;
  maxPoints: number;
}

export class ServerRPSEngine implements IServerGameEngine {
  readonly gameType: GameType = 'rps';
  private state: RPSState;
  private secretChoices: { p1: RPSChoice | null; p2: RPSChoice | null };
  private maxPoints: number;

  constructor(maxPoints: number = 3) {
    this.maxPoints = maxPoints;
    this.state = this.createInitialState();
    this.secretChoices = { p1: null, p2: null };
  }

  private createInitialState(): RPSState {
    return {
      p1Score: 0,
      p2Score: 0,
      p1HasChosen: false,
      p2HasChosen: false,
      lastP1Choice: null,
      lastP2Choice: null,
      lastRoundWinner: null,
      matchWinner: null,
      roundNumber: 1,
      maxPoints: this.maxPoints,
    };
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  getActivePlayer(): PlayerRole {
    return 'p1'; // In RPS both players choose simultaneously
  }

  isGameOver(): boolean {
    return this.state.matchWinner !== null;
  }

  getWinner(): MatchWinner {
    return this.state.matchWinner;
  }

  reset(): void {
    this.state = this.createInitialState();
    this.secretChoices = { p1: null, p2: null };
  }

  handleAction(player: PlayerRole, actionType: string, payload?: unknown): GameActionResult {
    if (actionType !== 'CHOOSE_RPS') {
      return {
        success: false,
        error: `Unsupported action type: ${actionType}`,
        actionType,
        payload: {},
        isGameOver: this.isGameOver(),
        winner: this.getWinner(),
      };
    }

    if (this.isGameOver()) {
      return {
        success: false,
        error: 'Match has already ended',
        actionType,
        payload: {},
        isGameOver: true,
        winner: this.getWinner(),
      };
    }

    const { choice } = (payload as { choice?: RPSChoice }) || {};
    if (!choice || !['rock', 'paper', 'scissors'].includes(choice)) {
      return {
        success: false,
        error: `Invalid choice: ${choice}`,
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
    }

    this.secretChoices[player] = choice;
    if (player === 'p1') this.state.p1HasChosen = true;
    if (player === 'p2') this.state.p2HasChosen = true;

    // If both players have chosen, reveal clash and score round
    if (this.secretChoices.p1 && this.secretChoices.p2) {
      const p1Choice = this.secretChoices.p1;
      const p2Choice = this.secretChoices.p2;

      this.state.lastP1Choice = p1Choice;
      this.state.lastP2Choice = p2Choice;

      const roundWinner = this.determineRoundWinner(p1Choice, p2Choice);
      this.state.lastRoundWinner = roundWinner;

      if (roundWinner === 'p1') {
        this.state.p1Score += 1;
      } else if (roundWinner === 'p2') {
        this.state.p2Score += 1;
      }

      if (this.state.p1Score >= this.state.maxPoints) {
        this.state.matchWinner = 'p1';
      } else if (this.state.p2Score >= this.state.maxPoints) {
        this.state.matchWinner = 'p2';
      } else {
        this.state.roundNumber += 1;
      }

      const isOver = this.state.matchWinner !== null;
      const matchWin = this.state.matchWinner;

      const resultPayload = {
        round: this.state.roundNumber,
        p1Choice,
        p2Choice,
        roundWinner,
        p1Score: this.state.p1Score,
        p2Score: this.state.p2Score,
        matchWinner: matchWin,
      };

      // Reset choices for next round
      this.secretChoices = { p1: null, p2: null };
      this.state.p1HasChosen = false;
      this.state.p2HasChosen = false;

      return {
        success: true,
        actionType: 'RPS_ROUND_RESOLVED',
        payload: resultPayload,
        isGameOver: isOver,
        winner: matchWin,
        revealed: true,
      };
    }

    // Only one player has chosen so far
    return {
      success: true,
      actionType: 'RPS_CHOICE_COMMITTED',
      payload: { player },
      isGameOver: false,
      winner: null,
      revealed: false,
    };
  }

  private determineRoundWinner(c1: RPSChoice, c2: RPSChoice): 'p1' | 'p2' | 'draw' {
    if (c1 === c2) return 'draw';
    if (
      (c1 === 'rock' && c2 === 'scissors') ||
      (c1 === 'paper' && c2 === 'rock') ||
      (c1 === 'scissors' && c2 === 'paper')
    ) {
      return 'p1';
    }
    return 'p2';
  }
}
