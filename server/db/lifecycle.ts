import { DatabasePool } from './index';
import { logEvent, metrics } from '../observability';

/**
 * Operational Data Lifecycle Manager.
 * Safely prunes ephemeral operational telemetry (such as game_actions)
 * while strictly guaranteeing that financial records (transactions, settlements, treasury)
 * remain permanent and immutable.
 */
export class DatabaseLifecycle {
  constructor(private readonly dbPool: DatabasePool = DatabasePool.getInstance()) {}

  /**
   * Prune non-financial gameplay action idempotency logs older than the retention threshold.
   * Default retention is 7 days.
   */
  async pruneOldGameActions(retentionDays = 7): Promise<number> {
    if (!this.dbPool.usesPersistentDatabase()) {
      return 0;
    }

    const intervalStr = `${Math.max(1, retentionDays)} days`;
    try {
      const result = await this.dbPool.query(
        'DELETE FROM game_actions WHERE created_at < NOW() - $1::interval',
        [intervalStr]
      );
      const count = result.rowCount || 0;
      metrics.incrementCounter('game_actions_pruned_total', count);
      logEvent('info', 'db.lifecycle.pruned_game_actions', { retentionDays, count });
      return count;
    } catch (error) {
      logEvent('error', 'db.lifecycle.prune_failed', { error: String(error) });
      return 0;
    }
  }
}
