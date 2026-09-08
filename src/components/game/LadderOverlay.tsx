import React from 'react';
import { LADDERS, getTileCenterPercent } from '../../config/boardConfig';

interface LadderOverlayProps {
  activeLadderId?: string | null;
}

export const LadderOverlay: React.FC<LadderOverlayProps> = ({ activeLadderId = null }) => {
  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none z-10" 
      viewBox="0 0 100 100" 
      preserveAspectRatio="none"
    >
      <defs>
        {/* Wooden Rail Gradient */}
        <linearGradient id="ladderWoodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#78350f" />
          <stop offset="30%" stopColor="#b45309" />
          <stop offset="70%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>

        <filter id="ladderShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0.8" dy="1.4" stdDeviation="0.9" floodColor="#000000" floodOpacity="0.75" />
        </filter>

        {/* Active Ladder Golden Glow Filter */}
        <filter id="activeLadderGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#f59e0b" floodOpacity="0.9" />
        </filter>
      </defs>

      {LADDERS.map((ladder) => {
        const isActive = activeLadderId === ladder.id;
        const bottomPos = getTileCenterPercent(ladder.bottom);
        const topPos = getTileCenterPercent(ladder.top);

        const dx = topPos.x - bottomPos.x;
        const dy = topPos.y - bottomPos.y;
        const length = Math.hypot(dx, dy);

        // Normalized perpendicular vector for ladder rail separation
        const railHalfWidth = 1.8;
        const perpX = -dy / (length || 1) * railHalfWidth;
        const perpY = dx / (length || 1) * railHalfWidth;

        // Left rail coordinates
        const l1x = bottomPos.x + perpX;
        const l1y = bottomPos.y + perpY;
        const l2x = topPos.x + perpX;
        const l2y = topPos.y + perpY;

        // Right rail coordinates
        const r1x = bottomPos.x - perpX;
        const r1y = bottomPos.y - perpY;
        const r2x = topPos.x - perpX;
        const r2y = topPos.y - perpY;

        // Calculate rungs along the ladder length
        const rungCount = Math.max(3, Math.round(length / 4.2));
        const rungs: { x1: number; y1: number; x2: number; y2: number }[] = [];

        for (let i = 1; i <= rungCount; i++) {
          const t = i / (rungCount + 1);
          const rx1 = l1x + (l2x - l1x) * t;
          const ry1 = l1y + (l2y - l1y) * t;
          const rx2 = r1x + (r2x - r1x) * t;
          const ry2 = r1y + (r2y - r1y) * t;
          rungs.push({ x1: rx1, y1: ry1, x2: rx2, y2: ry2 });
        }

        return (
          <g key={ladder.id} filter={isActive ? 'url(#activeLadderGlow)' : 'url(#ladderShadow)'} className={isActive ? 'animate-pulse' : ''}>
            {/* Left Rail */}
            <line
              x1={l1x}
              y1={l1y}
              x2={l2x}
              y2={l2y}
              stroke="url(#ladderWoodGrad)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {/* Left Rail Shadow line */}
            <line
              x1={l1x}
              y1={l1y}
              x2={l2x}
              y2={l2y}
              stroke="#451a03"
              strokeWidth="0.4"
            />

            {/* Right Rail */}
            <line
              x1={r1x}
              y1={r1y}
              x2={r2x}
              y2={r2y}
              stroke="url(#ladderWoodGrad)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {/* Right Rail Shadow line */}
            <line
              x1={r1x}
              y1={r1y}
              x2={r2x}
              y2={r2y}
              stroke="#451a03"
              strokeWidth="0.4"
            />

            {/* Rungs */}
            {rungs.map((rung, idx) => (
              <g key={idx}>
                {/* Rung base */}
                <line
                  x1={rung.x1}
                  y1={rung.y1}
                  x2={rung.x2}
                  y2={rung.y2}
                  stroke="url(#ladderWoodGrad)"
                  strokeWidth="1.0"
                  strokeLinecap="round"
                />
                {/* Rung golden highlight */}
                <line
                  x1={rung.x1}
                  y1={rung.y1}
                  x2={rung.x2}
                  y2={rung.y2}
                  stroke="#fbbf24"
                  strokeWidth="0.3"
                  opacity="0.75"
                />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
};
