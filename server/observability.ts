export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<StructuredLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getActiveLogLevel(): StructuredLogLevel {
  const configured = (process.env.LOG_LEVEL || 'info').toLowerCase() as StructuredLogLevel;
  return configured in LOG_LEVEL_PRIORITY ? configured : 'info';
}

export function logEvent(
  level: StructuredLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  error?: unknown,
): void {
  const activeLevel = getActiveLogLevel();
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[activeLevel]) {
    return;
  }

  const errorDetails: Record<string, unknown> = {};
  if (error instanceof Error) {
    errorDetails.errorName = error.name;
    errorDetails.errorMessage = error.message;
    errorDetails.stack = error.stack;
  } else if (error !== undefined && error !== null) {
    errorDetails.errorMessage = String(error);
  }

  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined)
    ),
    ...errorDetails,
  };

  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Lightweight, zero-dependency in-memory metrics registry for production telemetry.
 * Tracks counters, gauges, and latency histograms with percentile computation (p50, p95, p99).
 */
export interface HistogramStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface SystemMetricsSnapshot {
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    heapTotalMb: number;
    heapUsedMb: number;
    externalMb: number;
  };
  eventLoopLagMs: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramStats>;
  system: SystemMetricsSnapshot;
}

export class MetricsRegistry {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histogramSamples: Map<string, number[]> = new Map();
  private maxSamplesPerHistogram: number;
  private lastLagSampleMs: number = 0;
  private lagCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxSamplesPerHistogram = 1000) {
    this.maxSamplesPerHistogram = maxSamplesPerHistogram;
    this.startLagSampler();
  }

  private startLagSampler(): void {
    let lastTime = performance.now();
    this.lagCheckTimer = setInterval(() => {
      const now = performance.now();
      const delta = now - lastTime;
      // Interval is 1000ms, lag is anything exceeding 1000ms
      this.lastLagSampleMs = Math.max(0, delta - 1000);
      lastTime = now;
    }, 1000);

    if (this.lagCheckTimer && typeof this.lagCheckTimer === 'object' && 'unref' in this.lagCheckTimer) {
      (this.lagCheckTimer as any).unref();
    }
  }

  private formatMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    const key = this.formatMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatMetricKey(name, labels);
    this.gauges.set(key, value);
  }

  recordHistogram(name: string, valueMs: number, labels?: Record<string, string>): void {
    const key = this.formatMetricKey(name, labels);
    let samples = this.histogramSamples.get(key);
    if (!samples) {
      samples = [];
      this.histogramSamples.set(key, samples);
    }
    samples.push(valueMs);
    if (samples.length > this.maxSamplesPerHistogram) {
      samples.shift();
    }
  }

  getSnapshot(): MetricsSnapshot {
    const mem = process.memoryUsage();
    const countersObj: Record<string, number> = {};
    for (const [k, v] of this.counters) {
      countersObj[k] = v;
    }

    const gaugesObj: Record<string, number> = {};
    for (const [k, v] of this.gauges) {
      gaugesObj[k] = v;
    }

    const histogramsObj: Record<string, HistogramStats> = {};
    for (const [k, samples] of this.histogramSamples) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, val) => acc + val, 0);
      const count = sorted.length;
      const min = sorted[0];
      const max = sorted[count - 1];
      const avg = Number((sum / count).toFixed(2));

      const p50Index = Math.floor((count - 1) * 0.50);
      const p95Index = Math.floor((count - 1) * 0.95);
      const p99Index = Math.floor((count - 1) * 0.99);

      const p50 = sorted[p50Index];
      const p95 = sorted[p95Index];
      const p99 = sorted[p99Index];

      histogramsObj[k] = { count, sum, min, max, avg, p50, p95, p99 };
    }

    return {
      timestamp: new Date().toISOString(),
      counters: countersObj,
      gauges: gaugesObj,
      histograms: histogramsObj,
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
          heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
          heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
          externalMb: Number((mem.external / (1024 * 1024)).toFixed(2)),
        },
        eventLoopLagMs: Number(this.lastLagSampleMs.toFixed(2)),
      },
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histogramSamples.clear();
  }

  close(): void {
    if (this.lagCheckTimer) {
      clearInterval(this.lagCheckTimer);
      this.lagCheckTimer = null;
    }
  }
}

export const metrics = new MetricsRegistry();
