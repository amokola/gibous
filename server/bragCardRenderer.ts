import sharp from 'sharp';
import type { DailyBragStats } from './bragStats';
import { metrics } from './observability';

export type BragCardData = DailyBragStats & { dateLabel?: string };

// Configure Sharp for safe multi-core operation without monopolizing libuv threadpool
sharp.concurrency(2);
sharp.cache({ files: 0, items: 50, memory: 50 });

const COLORS = {
  ink: '#141414',
  paper: '#fbfaf7',
  yellow: '#fff9c4',
  warmPaper: '#f2efe9',
  blue: '#1f3a5f',
  green: '#1e7a3a',
  red: '#9b2c2c',
  gold: '#f6c945',
  muted: '#5b5b55',
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toLocaleString('en-US');
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`;
}

function graphMarkup(history: BragCardData['history']): string {
  const chart = { x: 100, y: 730, width: 880, height: 280 };
  const values = history.map((point) => point.pnl);
  const maxValue = Math.max(1, ...values.map((value) => Math.abs(value)));
  const baseline = chart.y + chart.height / 2;
  const points = history.map((point, index) => {
    const x = chart.x + (chart.width / Math.max(1, history.length - 1)) * index;
    const y = baseline - (point.pnl / maxValue) * (chart.height / 2 - 26);
    return { x, y, point };
  });
  const line = points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points.at(-1)?.x.toFixed(1)} ${baseline} L ${points[0]?.x.toFixed(1)} ${baseline} Z`;

  return `
    <text x="${chart.x}" y="690" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2" fill="${COLORS.muted}">7-DAY PNL</text>
    <rect x="${chart.x}" y="${chart.y}" width="${chart.width}" height="${chart.height}" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="4" />
    <line x1="${chart.x}" y1="${baseline}" x2="${chart.x + chart.width}" y2="${baseline}" stroke="${COLORS.ink}" stroke-width="2" stroke-dasharray="10 10" opacity="0.45" />
    <path d="${area}" fill="${COLORS.gold}" opacity="0.28" />
    <path d="${line}" fill="none" stroke="${COLORS.blue}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map(({ x, y, point }) => `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${point.pnl >= 0 ? COLORS.green : COLORS.red}" stroke="${COLORS.ink}" stroke-width="3" />
      <text x="${x.toFixed(1)}" y="${chart.y + chart.height + 42}" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="${COLORS.muted}">${escapeXml(point.date.slice(5))}</text>
    `).join('')}
  `;
}

/**
 * Concurrency limiter for CPU-heavy Sharp rasterization.
 * Enforces a bounded concurrency ceiling (default max 2 concurrent renders)
 * to ensure background image generation never starves real-time gameplay loops.
 */
class RenderQueue {
  private activeCount = 0;
  private maxConcurrent = 2;
  private queue: Array<() => void> = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }
}

const renderQueue = new RenderQueue();

export async function renderBragCard(stats: BragCardData): Promise<Buffer> {
  const isProfit = stats.today.pnl >= 0;
  const pnlColor = isProfit ? COLORS.green : COLORS.red;
  const record = `${stats.today.wins}W • ${stats.today.losses}L • ${stats.today.draws}D`;
  const dateLabel = stats.dateLabel || stats.history.at(-1)?.date || '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
      <rect width="1080" height="1350" fill="${COLORS.warmPaper}" />
      <rect x="42" y="42" width="996" height="1266" rx="12" fill="${COLORS.yellow}" stroke="${COLORS.ink}" stroke-width="8" />
      <rect x="72" y="72" width="936" height="120" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="4" />
      <text x="104" y="122" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="4" fill="${COLORS.red}">GIBOUS • DAILY BRAG</text>
      <text x="104" y="168" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="${COLORS.ink}">${escapeXml(stats.name)}</text>
      <text x="976" y="122" text-anchor="end" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="${COLORS.muted}">${escapeXml(dateLabel)}</text>
      <text x="976" y="168" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="${COLORS.blue}">@${escapeXml(stats.username || 'player')}</text>

      <text x="104" y="258" font-family="Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="3" fill="${COLORS.muted}">TODAY&apos;S NET PNL</text>
      <text x="104" y="378" font-family="Arial, sans-serif" font-size="112" font-weight="900" fill="${pnlColor}">${formatSigned(stats.today.pnl)}</text>
      <text x="106" y="426" font-family="Arial, sans-serif" font-size="31" font-weight="800" fill="${COLORS.ink}">GRAM</text>

      <rect x="622" y="234" width="350" height="112" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="4" />
      <text x="650" y="275" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="2" fill="${COLORS.muted}">ROI</text>
      <text x="650" y="326" font-family="Arial, sans-serif" font-size="50" font-weight="900" fill="${pnlColor}">${formatSigned(stats.today.roiPercent)}%</text>

      <rect x="622" y="366" width="350" height="112" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="4" />
      <text x="650" y="407" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="2" fill="${COLORS.muted}">WIN RATE</text>
      <text x="650" y="458" font-family="Arial, sans-serif" font-size="50" font-weight="900" fill="${COLORS.blue}">${formatNumber(stats.today.winRate)}%</text>

      <rect x="72" y="520" width="936" height="126" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="4" />
      <text x="104" y="568" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2" fill="${COLORS.muted}">RECORD</text>
      <text x="104" y="616" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="${COLORS.ink}">${record}</text>
      <text x="548" y="568" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2" fill="${COLORS.muted}">CURRENT STREAK</text>
      <text x="548" y="616" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="${COLORS.red}">🔥 ${stats.currentStreak} WINS</text>

      ${graphMarkup(stats.history)}

      <line x1="72" y1="1090" x2="1008" y2="1090" stroke="${COLORS.ink}" stroke-width="4" />
      <text x="104" y="1154" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="${COLORS.blue}">SERVER-VERIFIED DUEL LEDGER</text>
      <text x="104" y="1204" font-family="Arial, sans-serif" font-size="26" fill="${COLORS.muted}">Can you beat today&apos;s record?</text>
      <text x="976" y="1204" text-anchor="end" font-family="Arial, sans-serif" font-size="25" font-weight="800" fill="${COLORS.red}">GIBOUS</text>
    </svg>
  `;

  return renderQueue.run(async () => {
    const start = performance.now();
    const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
    const duration = performance.now() - start;
    metrics.recordHistogram('brag_render_duration_ms', duration);
    metrics.incrementCounter('brag_renders_total', 1);
    return buffer;
  });
}
