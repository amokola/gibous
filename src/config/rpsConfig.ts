import { PlayerId, RPSChoice } from '../types/game';

export interface RPSChoiceConfig {
  id: RPSChoice;
  label: string;
  emoji: string;
  color: string;
  glow: string;
  beats: RPSChoice;
  losesTo: RPSChoice;
  description: string;
}

export const RPS_CHOICES: Record<RPSChoice, RPSChoiceConfig> = {
  rock: {
    id: 'rock',
    label: 'Rock',
    emoji: '🪨',
    color: '#f59e0b',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.5)] border-amber-500/60 ring-1 ring-amber-500/30',
    beats: 'scissors',
    losesTo: 'paper',
    description: 'Crushes Scissors',
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    emoji: '📄',
    color: '#38bdf8',
    glow: 'shadow-[0_0_20px_rgba(56,189,248,0.5)] border-sky-500/60 ring-1 ring-sky-500/30',
    beats: 'rock',
    losesTo: 'scissors',
    description: 'Covers Rock',
  },
  scissors: {
    id: 'scissors',
    label: 'Scissors',
    emoji: '✂️',
    color: '#22c55e',
    glow: 'shadow-[0_0_20px_rgba(34,197,94,0.5)] border-emerald-500/60 ring-1 ring-emerald-500/30',
    beats: 'paper',
    losesTo: 'rock',
    description: 'Cuts Paper',
  },
};

export const TARGET_WINS = 3; // First to 3 wins

export function evaluateRPSRound(p1Choice: RPSChoice, p2Choice: RPSChoice): PlayerId | 'draw' {
  if (p1Choice === p2Choice) return 'draw';
  if (RPS_CHOICES[p1Choice].beats === p2Choice) return 'p1';
  return 'p2';
}

export function getRPSBotChoice(userHistory: RPSChoice[] = []): RPSChoice {
  const choices: RPSChoice[] = ['rock', 'paper', 'scissors'];

  // If user has a favorite move, 40% chance bot counters it
  if (userHistory.length >= 2) {
    const lastChoice = userHistory[userHistory.length - 1];
    if (Math.random() < 0.45) {
      return RPS_CHOICES[lastChoice].losesTo;
    }
  }

  // Otherwise pick completely random
  const randomIndex = Math.floor(Math.random() * choices.length);
  return choices[randomIndex];
}
