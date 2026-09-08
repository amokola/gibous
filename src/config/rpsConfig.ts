import { RPSChoice } from '../types/game';

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
