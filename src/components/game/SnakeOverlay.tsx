import React from 'react';
import { SNAKES, getTileCenterPercent } from '../../config/boardConfig';

export const SnakeOverlay: React.FC = () => {
  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none z-10" 
      viewBox="0 0 100 100" 
      preserveAspectRatio="none"
    >
      <defs>
        {/* Green Snake Body Gradient */}
        <linearGradient id="greenSnakeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="40%" stopColor="#22c55e" />
          <stop offset="80%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>

        {/* Red / Coral Snake Body Gradient */}
        <linearGradient id="redSnakeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="40%" stopColor="#ef4444" />
          <stop offset="80%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>

        {/* Snake Drop Shadow Filter */}
        <filter id="snakeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.5" dy="1.2" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.7" />
        </filter>
      </defs>

      {SNAKES.map((snake) => {
        const headPos = getTileCenterPercent(snake.head);
        const tailPos = getTileCenterPercent(snake.tail);

        const isGreen = snake.color === 'green';
        const gradId = isGreen ? 'url(#greenSnakeGrad)' : 'url(#redSnakeGrad)';
        const spotColor = isGreen ? '#14532d' : '#450a0a';

        // Calculate control points for an S-curve body
        const dx = tailPos.x - headPos.x;
        const dy = tailPos.y - headPos.y;
        const distance = Math.hypot(dx, dy);

        // Perpendicular offset for curves
        const perpX = -dy / (distance || 1) * 8;
        const perpY = dx / (distance || 1) * 8;

        const cp1x = headPos.x + dx * 0.33 + perpX;
        const cp1y = headPos.y + dy * 0.33 + perpY;
        const cp2x = headPos.x + dx * 0.66 - perpX;
        const cp2y = headPos.y + dy * 0.66 - perpY;

        const pathD = `M ${headPos.x} ${headPos.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tailPos.x} ${tailPos.y}`;

        // Angle for head rotation
        const headAngle = Math.atan2(cp1y - headPos.y, cp1x - headPos.x) * (180 / Math.PI);

        return (
          <g key={snake.id} filter="url(#snakeShadow)">
            {/* Outer body outline/stroke */}
            <path
              d={pathD}
              fill="none"
              stroke="#0a0e14"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            {/* Snake main body */}
            <path
              d={pathD}
              fill="none"
              stroke={gradId}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            {/* Decorative dashed spots on snake back */}
            <path
              d={pathD}
              fill="none"
              stroke={spotColor}
              strokeWidth="1.2"
              strokeDasharray="1.5 2.5"
              strokeLinecap="round"
              opacity="0.8"
            />

            {/* Snake Head */}
            <g transform={`translate(${headPos.x}, ${headPos.y}) rotate(${headAngle - 180})`}>
              {/* Tongue */}
              <path
                d="M 2.6 0 L 4.8 -0.8 M 2.6 0 L 4.8 0.8"
                stroke="#ef4444"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
              {/* Head shape */}
              <ellipse cx="0" cy="0" rx="2.8" ry="2.2" fill={isGreen ? '#22c55e' : '#ef4444'} stroke="#0a0e14" strokeWidth="0.4" />
              {/* Eyes */}
              <circle cx="0.5" cy="-1.0" r="0.6" fill="#fef08a" />
              <circle cx="0.5" cy="1.0" r="0.6" fill="#fef08a" />
              <circle cx="0.6" cy="-1.0" r="0.3" fill="#000000" />
              <circle cx="0.6" cy="1.0" r="0.3" fill="#000000" />
            </g>

            {/* Snake Tail tip */}
            <circle cx={tailPos.x} cy={tailPos.y} r="0.9" fill={isGreen ? '#14532d' : '#7f1d1d'} stroke="#0a0e14" strokeWidth="0.3" />
          </g>
        );
      })}
    </svg>
  );
};
