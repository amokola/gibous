import { describe, expect, it } from 'vitest';
import { shouldApplyRoomSnapshot } from '../../../src/state/roomSnapshotOrdering';

describe('room snapshot ordering', () => {
  it('accepts a new rematch room even when its version restarted at one', () => {
    expect(shouldApplyRoomSnapshot(
      { code: 'DUEL-R1', version: 18 },
      { code: 'DUEL-R2', version: 1 },
    )).toBe(true);
  });

  it('rejects stale snapshots for the same room and accepts current versions', () => {
    const current = { code: 'DUEL-R2', version: 4 };
    expect(shouldApplyRoomSnapshot(current, { code: 'DUEL-R2', version: 3 })).toBe(false);
    expect(shouldApplyRoomSnapshot(current, { code: 'DUEL-R2', version: 4 })).toBe(true);
  });
});
