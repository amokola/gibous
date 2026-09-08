import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('feedback removal', () => {
  it('contains no audio or haptic feedback implementation or controls', () => {
    const source = collectSourceFiles(sourceRoot)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(existsSync(join(sourceRoot, 'hooks', 'useSoundEffects.ts'))).toBe(false);
    expect(source).not.toMatch(/useSoundEffects|AudioContext|HapticFeedback|\bhaptic\b/i);
    expect(source).not.toMatch(/\bsounds?\b|play(?:Click|Coin|DiceRoll|DiscDrop|CardFlip|PowerUp|Emote|MatchFound|Clash|Countdown|Step|Ladder|Snake|Defeat|Victory)/i);
    expect(source).not.toMatch(/isMuted|onToggleMute|Volume2|VolumeX|Toggle sound|Audio toggle/i);
  });
});
