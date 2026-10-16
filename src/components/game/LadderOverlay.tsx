import React, { useId } from 'react';
import { LADDERS, getTileCenterPercent } from '../../config/boardConfig';

interface LadderOverlayProps {
  activeLadderId?: string | null;
}

export const LadderOverlay: React.FC<LadderOverlayProps> = ({ activeLadderId = null }) => {
  const uid = useId().replace(/:/g, '');

  return (
    <svg className="ladders-illustration-layer absolute inset-0 z-10 h-full w-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid="ladders-overlay">
      <defs>
        <linearGradient id={`${uid}-rail`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6b3e22" />
          <stop offset="24%" stopColor="#c58a4e" />
          <stop offset="52%" stopColor="#f0c47b" />
          <stop offset="77%" stopColor="#b8783c" />
          <stop offset="100%" stopColor="#63391f" />
        </linearGradient>
        <linearGradient id={`${uid}-rung`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#70401f" />
          <stop offset="38%" stopColor="#e2a85f" />
          <stop offset="55%" stopColor="#f2cc86" />
          <stop offset="100%" stopColor="#70401f" />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-35%" y="-35%" width="170%" height="170%">
          <feDropShadow dx="0.65" dy="1" stdDeviation="0.55" floodColor="#312013" floodOpacity="0.62" />
        </filter>
        <filter id={`${uid}-active`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.3" stdDeviation="1.35" floodColor="#ffd071" floodOpacity="0.98" />
        </filter>
      </defs>

      {LADDERS.map((ladder) => {
        const isActive = activeLadderId === ladder.id;
        const bottom = getTileCenterPercent(ladder.bottom);
        const top = getTileCenterPercent(ladder.top);
        const dx = top.x - bottom.x;
        const dy = top.y - bottom.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = (-dy / length) * 1.72;
        const ny = (dx / length) * 1.72;
        const rails = [
          { x1: bottom.x + nx, y1: bottom.y + ny, x2: top.x + nx, y2: top.y + ny },
          { x1: bottom.x - nx, y1: bottom.y - ny, x2: top.x - nx, y2: top.y - ny },
        ];
        const rungCount = Math.max(4, Math.round(length / 5.1));
        const rungAngle = Math.atan2(dy, dx) * 180 / Math.PI + 90;

        return (
          <g key={ladder.id} data-ladder-id={ladder.id} data-active={isActive ? 'true' : 'false'} className={`ladder-illustration${isActive ? ' ladder-illustration-active' : ''}`} filter={`url(#${uid}-${isActive ? 'active' : 'shadow'})`}>
            {/* Thick timber rails with an inked edge, warm grain and a raised highlight. */}
            {rails.map((rail, index) => (
              <g key={index} data-ladder-rail>
                <line x1={rail.x1} y1={rail.y1} x2={rail.x2} y2={rail.y2} stroke="#4e2b17" strokeWidth="2.55" strokeLinecap="round" />
                <line x1={rail.x1} y1={rail.y1} x2={rail.x2} y2={rail.y2} stroke={`url(#${uid}-rail)`} strokeWidth="1.86" strokeLinecap="round" />
                <line x1={rail.x1 - 0.32} y1={rail.y1} x2={rail.x2 - 0.32} y2={rail.y2} stroke="#ffe0a1" strokeWidth="0.34" strokeLinecap="round" opacity="0.9" />
                <path d={`M ${rail.x1 + 0.34} ${rail.y1 + 1.8} Q ${(rail.x1 + rail.x2) / 2 + 0.1} ${(rail.y1 + rail.y2) / 2} ${rail.x2 + 0.34} ${rail.y2 - 1.8}`} fill="none" stroke="#744326" strokeWidth="0.24" strokeDasharray="0.75 1.8" opacity="0.8" />
              </g>
            ))}

            {Array.from({ length: rungCount }, (_, index) => {
              const t = (index + 1) / (rungCount + 1);
              const cx = bottom.x + dx * t;
              const cy = bottom.y + dy * t;
              const lx = cx + nx;
              const ly = cy + ny;
              const rx = cx - nx;
              const ry = cy - ny;
              return (
                <g key={index}>
                  <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#4e2b17" strokeWidth="1.95" strokeLinecap="round" />
                  <line data-ladder-rung x1={lx} y1={ly} x2={rx} y2={ry} stroke={`url(#${uid}-rung)`} strokeWidth="1.34" strokeLinecap="round" />
                  <line x1={lx + 0.12} y1={ly - 0.26} x2={rx + 0.12} y2={ry - 0.26} stroke="#ffe0a1" strokeWidth="0.3" strokeLinecap="round" opacity="0.9" />
                  {/* A small rope wrap at each rung joint makes the construction feel crafted. */}
                  {[{ x: lx, y: ly }, { x: rx, y: ry }].map((joint, jointIndex) => (
                    <g key={jointIndex} data-ladder-binding transform={`translate(${joint.x} ${joint.y}) rotate(${rungAngle})`}>
                      <path d="M -0.7 -0.55 Q 0 -0.05 0.7 0.55 M -0.7 0.55 Q 0 0.05 0.7 -0.55" fill="none" stroke="#f0cb87" strokeWidth="0.42" strokeLinecap="round" />
                      <circle r="0.23" fill="#a96835" stroke="#603a21" strokeWidth="0.16" />
                      <circle cx="-0.06" cy="-0.08" r="0.07" fill="#fff0c7" />
                    </g>
                  ))}
                </g>
              );
            })}

            {/* Bound timber ends */}
            {rails.flatMap((rail) => [{ x: rail.x1, y: rail.y1 }, { x: rail.x2, y: rail.y2 }]).map((p, index) => (
              <g key={index} data-ladder-cap>
                <circle cx={p.x} cy={p.y} r="1.08" fill="#4e2b17" />
                <circle cx={p.x} cy={p.y} r="0.77" fill={`url(#${uid}-rung)`} stroke="#6b3e22" strokeWidth="0.23" />
                <path d={`M ${p.x - 0.5} ${p.y + 0.43} Q ${p.x} ${p.y - 0.1} ${p.x + 0.5} ${p.y - 0.43}`} fill="none" stroke="#ffe4ad" strokeWidth="0.22" />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
};
