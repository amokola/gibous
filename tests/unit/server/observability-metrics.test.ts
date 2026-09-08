import { describe, it, expect, beforeEach } from 'vitest';
import { metrics, MetricsRegistry } from '../../../server/observability';

describe('MetricsRegistry & Observability Telemetry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it('tracks counters correctly', () => {
    registry.incrementCounter('ws_messages_total', 1, { type: 'ROLL_DICE' });
    registry.incrementCounter('ws_messages_total', 2, { type: 'ROLL_DICE' });
    registry.incrementCounter('ws_messages_total', 1, { type: 'JOIN_ROOM' });

    const snapshot = registry.getSnapshot();
    expect(snapshot.counters['ws_messages_total{type="ROLL_DICE"}']).toBe(3);
    expect(snapshot.counters['ws_messages_total{type="JOIN_ROOM"}']).toBe(1);
  });

  it('tracks gauges correctly', () => {
    registry.setGauge('ws_active_connections', 42);
    registry.setGauge('db_pool_utilization', 0.6);

    const snapshot = registry.getSnapshot();
    expect(snapshot.gauges['ws_active_connections']).toBe(42);
    expect(snapshot.gauges['db_pool_utilization']).toBe(0.6);
  });

  it('calculates histogram percentiles (p50, p95, p99, min, max, avg)', () => {
    // Record 100 sample latencies: 1ms to 100ms
    for (let i = 1; i <= 100; i++) {
      registry.recordHistogram('db_query_duration_ms', i, { query: 'settleWinMatch' });
    }

    const snapshot = registry.getSnapshot();
    const hist = snapshot.histograms['db_query_duration_ms{query="settleWinMatch"}'];
    expect(hist).toBeDefined();
    expect(hist.count).toBe(100);
    expect(hist.min).toBe(1);
    expect(hist.max).toBe(100);
    expect(hist.avg).toBe(50.5);
    expect(hist.p50).toBe(50);
    expect(hist.p95).toBe(95);
    expect(hist.p99).toBe(99);
  });

  it('provides comprehensive system snapshot including memory and runtime', () => {
    const snapshot = registry.getSnapshot();
    expect(snapshot.system).toBeDefined();
    expect(snapshot.system.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snapshot.system.memory.rssMb).toBeGreaterThan(0);
    expect(snapshot.system.memory.heapUsedMb).toBeGreaterThan(0);
    expect(typeof snapshot.system.eventLoopLagMs).toBe('number');
  });

  it('global metrics singleton functions as expected', () => {
    metrics.incrementCounter('global_test_counter', 5);
    const snap = metrics.getSnapshot();
    expect(snap.counters['global_test_counter']).toBeGreaterThanOrEqual(5);
  });
});
