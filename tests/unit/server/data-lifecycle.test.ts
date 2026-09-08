import { describe, it, expect, vi } from 'vitest';
import { DatabaseLifecycle } from '../../../server/db/lifecycle';
import { DatabasePool } from '../../../server/db/index';

describe('Data Lifecycle & Operational Table Pruning', () => {
  it('prunes old game_actions based on retention window', async () => {
    const dbPool = DatabasePool.getInstance();
    vi.spyOn(dbPool, 'usesPersistentDatabase').mockReturnValue(true);
    const querySpy = vi.spyOn(dbPool, 'query').mockResolvedValue({ rows: [], rowCount: 42 });

    const lifecycle = new DatabaseLifecycle(dbPool);
    const deletedCount = await lifecycle.pruneOldGameActions(7);

    expect(deletedCount).toBe(42);
    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM game_actions WHERE created_at < NOW() - $1::interval'),
      ['7 days']
    );
  });

  it('safeguards financial tables from any deletion', async () => {
    const dbPool = DatabasePool.getInstance();
    const lifecycle = new DatabaseLifecycle(dbPool);

    // Verify lifecycle only exposes game_actions pruning, no financial table deletion methods
    expect((lifecycle as any).pruneTransactions).toBeUndefined();
    expect((lifecycle as any).pruneSettlements).toBeUndefined();
    expect((lifecycle as any).pruneTreasury).toBeUndefined();
  });
});
