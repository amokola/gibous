import React, { useId } from 'react';
import { SNAKES, getTileCenterPercent } from '../../config/boardConfig';

interface SnakeOverlayProps {
  activeSnakeId?: string | null;
}

const SNAKE_PALETTES = {
  green: { hi: '#b4d866', mid: '#4e8c38', shade: '#24582c', belly: '#f2e9aa', spot: '#e9c94e', tongue: '#bb453b' },
  red: { hi: '#ffc078', mid: '#dc6548', shade: '#8f332d', belly: '#f7e7c9', spot: '#f3ad59', tongue: '#92394a' },
  purple: { hi: '#a7cde5', mid: '#557ca6', shade: '#294761', belly: '#f2e9aa', spot: '#d1d973', tongue: '#bd453b' },
} as const;

type Point = { x: number; y: number };
type SnakeRoute = { sway?: number; bias?: number; face: 1 | -1; c1?: Point; c2?: Point };

// These hand-tuned centerlines preserve the rule tiles while leaving visual lanes around the ladders.
const ROUTES: Record<string, SnakeRoute> = {
  'snake-95-75': { sway: 7.5, bias: 0, face: 1 },
  'snake-82-42': { sway: 6, bias: 0, face: -1 },
  'snake-68-53': { sway: 4, bias: 0, face: 1 },
  // Snake 36→14 takes a compact lower-left lane around the ladder cluster to keep the lower bodies apart.
  'snake-36-14': { face: -1, c1: { x: 30, y: 63 }, c2: { x: 30, y: 88 } },
  'snake-48-26': { face: 1, c1: { x: 86, y: 58 }, c2: { x: 72, y: 50 } },
  'snake-98-78': { sway: 7.5, bias: 0, face: -1 },
};

const pointAt = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
  };
};

const sampleRoute = (start: Point, c1: Point, c2: Point, end: Point, count = 44) =>
  Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count;
    const point = pointAt(start, c1, c2, end, t);
    const before = pointAt(start, c1, c2, end, Math.max(0, t - 0.002));
    const after = pointAt(start, c1, c2, end, Math.min(1, t + 0.002));
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    return { ...point, nx: -dy / length, ny: dx / length, t };
  });

type RouteSample = ReturnType<typeof sampleRoute>[number];

const smoothClosedPath = (points: Point[]) => {
  if (!points.length) return '';
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = mid(points[points.length - 1], points[0]);
  const commands = [`M ${first.x} ${first.y}`];
  points.forEach((point, index) => {
    const nextMid = mid(point, points[(index + 1) % points.length]);
    commands.push(`Q ${point.x} ${point.y} ${nextMid.x} ${nextMid.y}`);
  });
  return `${commands.join(' ')} Z`;
};

const buildSilhouette = (samples: RouteSample[]) => {
  const edges = samples.map(({ x, y, nx, ny, t }) => {
    // Broad shoulders through the body, a compact neck, and a true needle taper at the tail.
    const radius = 2.35 * Math.pow(Math.sin(Math.PI * t), 0.56) + 0.82 * (1 - t);
    return { left: { x: x + nx * radius, y: y + ny * radius }, right: { x: x - nx * radius, y: y - ny * radius } };
  });
  return smoothClosedPath([...edges.map((edge) => edge.left), ...edges.reverse().map((edge) => edge.right)]);
};

const buildBelly = (samples: RouteSample[]) => {
  const segment = samples.filter(({ t }) => t >= 0.16 && t <= 0.82);
  const ribbon = segment.map(({ x, y, nx, ny }) => ({ x: x - nx * 1.05, y: y - ny * 1.05 }));
  const otherEdge = segment.slice().reverse().map(({ x, y, nx, ny }) => ({ x: x - nx * 1.62, y: y - ny * 1.62 }));
  return smoothClosedPath([...ribbon, ...otherEdge]);
};

export const SnakeOverlay: React.FC<SnakeOverlayProps> = ({ activeSnakeId = null }) => {
  const uid = useId().replace(/:/g, '');

  return (
    <svg className="snakes-illustration-layer absolute inset-0 z-10 h-full w-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid="snakes-overlay">
      <defs>
        {(Object.keys(SNAKE_PALETTES) as Array<keyof typeof SNAKE_PALETTES>).map((color) => (
          <linearGradient key={color} id={`${uid}-${color}`} x1="18%" y1="0%" x2="82%" y2="100%">
            <stop offset="0%" stopColor={SNAKE_PALETTES[color].hi} />
            <stop offset="38%" stopColor={SNAKE_PALETTES[color].mid} />
            <stop offset="100%" stopColor={SNAKE_PALETTES[color].shade} />
          </linearGradient>
        ))}
        <filter id={`${uid}-shadow`} x="-35%" y="-35%" width="170%" height="170%">
          <feDropShadow dx="0.35" dy="0.75" stdDeviation="0.5" floodColor="#28251c" floodOpacity="0.45" />
        </filter>
        <filter id={`${uid}-active`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.45" stdDeviation="1.15" floodColor="#ffcf67" floodOpacity="0.9" />
        </filter>
        {SNAKES.map((snake) => {
          const head = getTileCenterPercent(snake.head);
          const tail = getTileCenterPercent(snake.tail);
          const dx = tail.x - head.x;
          const dy = tail.y - head.y;
          const length = Math.hypot(dx, dy) || 1;
          const route = ROUTES[snake.id] ?? { sway: 8, bias: 0, face: 1 as const };
          const px = (-dy / length) * (route.sway ?? 8);
          const py = (dx / length) * (route.sway ?? 8);
          const bx = (-dy / length) * (route.bias ?? 0);
          const by = (dx / length) * (route.bias ?? 0);
          const c1 = route.c1 ?? { x: head.x + dx * 0.32 + px + bx, y: head.y + dy * 0.32 + py + by };
          const c2 = route.c2 ?? { x: head.x + dx * 0.68 - px + bx, y: head.y + dy * 0.68 - py + by };
          const silhouette = buildSilhouette(sampleRoute(head, c1, c2, tail));
          const clipId = `${uid}-${snake.id}-pattern`;
          return <clipPath key={snake.id} id={clipId} data-snake-pattern-clip><path d={silhouette} /></clipPath>;
        })}
      </defs>

      {SNAKES.map((snake) => {
        const palette = SNAKE_PALETTES[snake.color];
        const head = getTileCenterPercent(snake.head);
        const tail = getTileCenterPercent(snake.tail);
        const dx = tail.x - head.x;
        const dy = tail.y - head.y;
        const length = Math.hypot(dx, dy) || 1;
        const route = ROUTES[snake.id] ?? { sway: 8, bias: 0, face: 1 as const };
        const px = (-dy / length) * (route.sway ?? 8);
        const py = (dx / length) * (route.sway ?? 8);
        const bx = (-dy / length) * (route.bias ?? 0);
        const by = (dx / length) * (route.bias ?? 0);
        const c1 = route.c1 ?? { x: head.x + dx * 0.32 + px + bx, y: head.y + dy * 0.32 + py + by };
        const c2 = route.c2 ?? { x: head.x + dx * 0.68 - px + bx, y: head.y + dy * 0.68 - py + by };
        const d = `M ${head.x} ${head.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${tail.x} ${tail.y}`;
        const samples = sampleRoute(head, c1, c2, tail);
        const silhouette = buildSilhouette(samples);
        const belly = buildBelly(samples);
        const isActive = activeSnakeId === snake.id;
        const spots = [0.18, 0.29, 0.40, 0.51, 0.62, 0.73, 0.84].map((t, index) => {
          const spot = samples[Math.round(t * (samples.length - 1))];
          const side = index % 2 ? -1 : 1;
          return {
            x: spot.x + spot.nx * side * 0.92,
            y: spot.y + spot.ny * side * 0.92,
            angle: Math.atan2(spot.ny, spot.nx) * 180 / Math.PI,
          };
        });

        return (
          <g key={snake.id} data-snake-id={snake.id} data-active={isActive ? 'true' : 'false'} className={`snake-illustration${isActive ? ' snake-illustration-active' : ''}`} filter={`url(#${uid}-${isActive ? 'active' : 'shadow'})`}>
            <path data-snake-route d={d} fill="none" stroke="transparent" strokeWidth="0.1" />
            <path data-snake-body d={silhouette} fill={`url(#${uid}-${snake.color})`} stroke={palette.shade} strokeWidth="0.48" strokeLinejoin="round" />

            <g clipPath={`url(#${uid}-${snake.id}-pattern)`}>
              <path data-snake-belly d={belly} fill={palette.belly} opacity="0.9" />
              {spots.map((spot, index) => (
                <g key={index} data-snake-spot transform={`translate(${spot.x} ${spot.y}) rotate(${spot.angle})`}>
                  <ellipse rx={index % 2 ? '0.76' : '0.9'} ry="0.55" fill={palette.spot} stroke={palette.shade} strokeWidth="0.16" />
                  <path d="M -0.35 -0.12 Q 0 -0.38 0.34 -0.1" fill="none" stroke="#fff4cf" strokeWidth="0.16" strokeLinecap="round" opacity="0.78" />
                </g>
              ))}
            </g>

            {/* Side-on head: one readable eye, a tapered muzzle, cheek, nostril, and forked tongue. */}
            <g data-snake-head className={isActive ? 'snake-active-head' : ''} transform={`translate(${head.x + route.face * 1.15} ${head.y - 0.25}) scale(${route.face * 0.94} 0.94)`}>
              <path d="M -2.75 -1.15 C -2.8 -2.75 -1.45 -3.75 0.15 -3.55 C 1.4 -3.42 2.15 -2.55 3.12 -2.18 C 4.2 -1.78 5 -1.08 4.72 -0.18 C 4.42 0.78 2.75 1.18 1.62 0.78 C 0.52 1.85 -1.28 1.72 -2.27 0.75 C -2.82 0.2 -3.05 -0.5 -2.75 -1.15 Z" fill={`url(#${uid}-${snake.color})`} stroke={palette.shade} strokeWidth="0.52" strokeLinejoin="round" />
              <path d="M -1.95 -2.38 C -0.95 -3.27 0.02 -3.16 0.88 -2.62" fill="none" stroke="#fff2c6" strokeWidth="0.42" strokeLinecap="round" opacity="0.76" />
              <ellipse cx="0.15" cy="-1.72" rx="0.65" ry="0.79" fill="#fff8e8" stroke="#30251d" strokeWidth="0.22" />
              <ellipse cx="0.43" cy="-1.68" rx="0.27" ry="0.48" fill="#211a16" />
              <circle cx="0.48" cy="-1.9" r="0.12" fill="#fff" />
              <path d="M 1.02 0.25 Q 2.5 0.88 4 0.14" fill="none" stroke="#513a27" strokeWidth="0.32" strokeLinecap="round" />
              <circle cx="3.92" cy="-0.78" r="0.17" fill={palette.shade} />
              <path d="M 4.55 0.36 Q 5.35 0.8 4.68 1.56 M 4.55 0.36 Q 5.55 0.14 5.75 0.92" fill="none" stroke={palette.tongue} strokeWidth="0.42" strokeLinecap="round" />
            </g>
          </g>
        );
      })}
    </svg>
  );
};
