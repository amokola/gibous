import type { ExtendedScreenState } from './useUIStore';

export type GameOverTransition = 'delayed' | 'immediate' | 'ignore';

export function getGameOverTransition(screen: ExtendedScreenState): GameOverTransition {
  if (screen === 'game') return 'delayed';
  if (screen === 'vs-intro') return 'immediate';
  return 'ignore';
}
