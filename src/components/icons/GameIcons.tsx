import React from 'react';

interface IconProps {
  size?: number | string;
  className?: string;
}

// 1. Premium Handcrafted Snake Icon (Detailed Coiled Viper with Scales, Fangs, Tongue)
export const SnakeIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="snakeBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ade80" />
        <stop offset="40%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
      <linearGradient id="snakeBellyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="100%" stopColor="#ca8a04" />
      </linearGradient>
      <linearGradient id="snakeHeadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#86efac" />
        <stop offset="60%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#166534" />
      </linearGradient>
    </defs>

    {/* Drop Shadow Under Belly */}
    <path
      d="M14 50 C10 40, 22 34, 32 34 C44 34, 52 26, 48 16 C44 8, 34 6, 26 12"
      stroke="#000000"
      strokeWidth="12"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Main Scaled Body */}
    <path
      d="M14 50 C10 40, 22 34, 32 34 C44 34, 52 26, 48 16 C44 8, 34 6, 26 12"
      stroke="url(#snakeBodyGrad)"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Diamond Scale Ridge Details */}
    <path
      d="M15 48 C12 40, 22 35, 31 35 C42 35, 49 27, 46 18 C43 11, 35 9, 29 13"
      stroke="#bbf7d0"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="2 4"
    />

    {/* Rattle Tail End Rings */}
    <circle cx="13" cy="50" r="3" fill="#ca8a04" stroke="#000000" strokeWidth="1.5" />
    <circle cx="11" cy="53" r="2.2" fill="#eab308" stroke="#000000" strokeWidth="1.2" />

    {/* Viper Head */}
    <path
      d="M26 12 C24 8, 16 7, 14 12 C12 17, 18 20, 24 19 C28 18, 28 15, 26 12 Z"
      fill="url(#snakeHeadGrad)"
      stroke="#000000"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* Glowing Eye */}
    <circle cx="21" cy="11" r="2.5" fill="#facc15" stroke="#000000" strokeWidth="1" />
    <ellipse cx="21" cy="11" rx="0.8" ry="1.8" fill="#000000" />
    <circle cx="20.4" cy="10.4" r="0.6" fill="#ffffff" />

    {/* Nostril */}
    <circle cx="15.5" cy="13.5" r="0.8" fill="#0f291e" />

    {/* Forked Crimson Tongue */}
    <path
      d="M14 15 L7 17 M7 17 L4 14 M7 17 L4 20"
      stroke="#ef4444"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 2. Premium 3D Woodcraft Ladder Icon (Realistic Wood Grain, Rungs, Cast Metal Bolts)
export const LadderIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="ladderPoleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="50%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
      <linearGradient id="ladderRungGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#fde68a" />
        <stop offset="40%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>

    {/* Left Heavy Wooden Beam */}
    <line x1="16" y1="58" x2="24" y2="6" stroke="#000000" strokeWidth="8" strokeLinecap="round" />
    <line x1="16" y1="58" x2="24" y2="6" stroke="url(#ladderPoleGrad)" strokeWidth="5" strokeLinecap="round" />
    <line x1="15.2" y1="58" x2="23.2" y2="6" stroke="#fef3c7" strokeWidth="1" strokeLinecap="round" opacity="0.6" />

    {/* Right Heavy Wooden Beam */}
    <line x1="40" y1="58" x2="48" y2="6" stroke="#000000" strokeWidth="8" strokeLinecap="round" />
    <line x1="40" y1="58" x2="48" y2="6" stroke="url(#ladderPoleGrad)" strokeWidth="5" strokeLinecap="round" />
    <line x1="39.2" y1="58" x2="47.2" y2="6" stroke="#fef3c7" strokeWidth="1" strokeLinecap="round" opacity="0.6" />

    {/* Wooden Rungs with Cast Metal Bolts */}
    {[16, 26, 36, 46].map((y, idx) => {
      const x1 = 18 + idx * 1.8;
      const x2 = 42 + idx * 1.8;
      return (
        <g key={y}>
          {/* Rung Shadow */}
          <line x1={x1} y1={y + 1} x2={x2} y2={y + 1} stroke="#000000" strokeWidth="6" strokeLinecap="round" />
          {/* Rung Wood Body */}
          <line x1={x1} y1={y} x2={x2} y2={y} stroke="url(#ladderRungGrad)" strokeWidth="4.5" strokeLinecap="round" />
          {/* Top Light Glint */}
          <line x1={x1 + 1} y1={y - 1} x2={x2 - 1} y2={y - 1} stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
          {/* Metal Bolt Rivets */}
          <circle cx={x1 + 1} cy={y} r="1.3" fill="#1e293b" stroke="#000000" strokeWidth="0.8" />
          <circle cx={x2 - 1} cy={y} r="1.3" fill="#1e293b" stroke="#000000" strokeWidth="0.8" />
        </g>
      );
    })}
  </svg>
);

// 3. Premium Isometric 3D Dice Icon (Beveled Rounded Edges, Recessed Pips, Solid Shadow)
export const DiceIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="diceTopFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#f1f5f9" />
      </linearGradient>
      <linearGradient id="diceLeftFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e2e8f0" />
        <stop offset="100%" stopColor="#cbd5e1" />
      </linearGradient>
      <linearGradient id="diceRightFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
    </defs>

    {/* Ground Solid Hard Shadow */}
    <polygon points="10,48 32,60 54,48 32,38" fill="#000000" opacity="0.3" />

    {/* Top Face (Showing 3 Pips) */}
    <path
      d="M32 8 L54 20 L32 32 L10 20 Z"
      fill="url(#diceTopFace)"
      stroke="#000000"
      strokeWidth="3"
      strokeLinejoin="round"
    />

    {/* Left Face (Showing 2 Pips) */}
    <path
      d="M10 20 L32 32 L32 54 L10 42 Z"
      fill="url(#diceLeftFace)"
      stroke="#000000"
      strokeWidth="3"
      strokeLinejoin="round"
    />

    {/* Right Face (Showing 4 Pips) */}
    <path
      d="M32 32 L54 20 L54 42 L32 54 Z"
      fill="url(#diceRightFace)"
      stroke="#000000"
      strokeWidth="3"
      strokeLinejoin="round"
    />

    {/* Top Face Inset Pips */}
    <circle cx="32" cy="20" r="2.8" fill="#0f172a" />
    <circle cx="22" cy="15" r="2.4" fill="#0f172a" />
    <circle cx="42" cy="25" r="2.4" fill="#0f172a" />

    {/* Left Face Inset Pips */}
    <circle cx="18" cy="29" r="2.4" fill="#0f172a" />
    <circle cx="24" cy="45" r="2.4" fill="#0f172a" />

    {/* Right Face Inset Pips */}
    <circle cx="40" cy="35" r="2.4" fill="#0f172a" />
    <circle cx="47" cy="30" r="2.4" fill="#0f172a" />
    <circle cx="40" cy="47" r="2.4" fill="#0f172a" />
    <circle cx="47" cy="42" r="2.4" fill="#0f172a" />
  </svg>
);

// 4. Premium Connect 4 Chassis Icon (Tactile Acrylic Discs & Dropping Alignment)
export const Connect4Icon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="c4GridGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#0c1e30" />
      </linearGradient>
      <linearGradient id="discGreenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ade80" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
      <linearGradient id="discBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>

    {/* Chassis Shadow */}
    <rect x="6" y="14" width="52" height="40" rx="8" fill="#000000" />

    {/* Blue Chassis Body */}
    <rect
      x="6"
      y="12"
      width="52"
      height="40"
      rx="8"
      fill="url(#c4GridGrad)"
      stroke="#000000"
      strokeWidth="3"
    />

    {/* 4 Connected Green Discs */}
    <g>
      <circle cx="16" cy="22" r="5" fill="url(#discGreenGrad)" stroke="#000000" strokeWidth="2" />
      <circle cx="27" cy="29" r="5" fill="url(#discGreenGrad)" stroke="#000000" strokeWidth="2" />
      <circle cx="37" cy="36" r="5" fill="url(#discGreenGrad)" stroke="#000000" strokeWidth="2" />
      <circle cx="48" cy="43" r="5" fill="url(#discGreenGrad)" stroke="#000000" strokeWidth="2" />

      {/* Gloss Highlight on Green Discs */}
      <path d="M14 19 Q16 17 18 19" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M25 26 Q27 24 29 26" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M35 33 Q37 31 39 33" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M46 40 Q48 38 50 40" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />

      {/* Golden Connect Laser Trace */}
      <line x1="16" y1="22" x2="48" y2="43" stroke="#fde047" strokeWidth="2.5" strokeDasharray="3 2" strokeLinecap="round" />
    </g>

    {/* Opponent Blue Discs in other slots */}
    <circle cx="37" cy="22" r="5" fill="url(#discBlueGrad)" stroke="#000000" strokeWidth="2" />
    <circle cx="16" cy="43" r="5" fill="url(#discBlueGrad)" stroke="#000000" strokeWidth="2" />
    <circle cx="27" cy="43" r="5" fill="url(#discBlueGrad)" stroke="#000000" strokeWidth="2" />

    {/* Stand Feet */}
    <path d="M10 52 L6 58 M54 52 L58 58" stroke="#000000" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

// 5. Premium Meteorite Rock / Fist Icon (Crystalline Facets, Sharp Ink Cuts)
export const RockIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="rockGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
      <linearGradient id="rockGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <linearGradient id="rockGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
    </defs>

    {/* Solid Hard Shadow */}
    <polygon points="32,6 52,18 58,42 42,58 20,56 8,36 16,14" fill="#000000" stroke="#000000" strokeWidth="4" />

    {/* Facet 1: Top Right */}
    <polygon points="32,6 52,18 36,32 16,14" fill="url(#rockGrad2)" stroke="#000000" strokeWidth="2.5" strokeLinejoin="round" />

    {/* Facet 2: Bottom Right Dark Base */}
    <polygon points="52,18 58,42 42,58 34,42 36,32" fill="url(#rockGrad3)" stroke="#000000" strokeWidth="2.5" strokeLinejoin="round" />

    {/* Facet 3: Bottom Left */}
    <polygon points="16,14 36,32 34,42 20,56 8,36" fill="url(#rockGrad1)" stroke="#000000" strokeWidth="2.5" strokeLinejoin="round" />

    {/* Facet 4: Center Core */}
    <polygon points="36,32 44,24 46,38 34,42" fill="#fde68a" stroke="#000000" strokeWidth="2" strokeLinejoin="round" />

    {/* Sharp Edge Highlight Cuts */}
    <line x1="32" y1="8" x2="36" y2="30" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <line x1="18" y1="16" x2="34" y2="31" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
  </svg>
);

// 6. Premium Blueprint / Origami Paper Icon (Wax Seal, Ruled Ink Lines, Corner Fold)
export const PaperIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="paperGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7dd3fc" />
        <stop offset="50%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="foldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0f2fe" />
        <stop offset="100%" stopColor="#bae6fd" />
      </linearGradient>
    </defs>

    {/* Solid Hard Shadow */}
    <path d="M14 10 L44 10 L54 20 L54 56 L14 56 Z" fill="#000000" stroke="#000000" strokeWidth="4" />

    {/* Main Blueprint Parchment */}
    <path
      d="M14 8 L44 8 L54 18 L54 54 L14 54 Z"
      fill="url(#paperGrad)"
      stroke="#000000"
      strokeWidth="3"
      strokeLinejoin="round"
    />

    {/* Realistic Corner Fold */}
    <path
      d="M44 8 L44 18 L54 18 Z"
      fill="url(#foldGrad)"
      stroke="#000000"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Ruled Blueprint Ink Lines */}
    <line x1="22" y1="20" x2="36" y2="20" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
    <line x1="22" y1="28" x2="46" y2="28" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
    <line x1="22" y1="36" x2="46" y2="36" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
    <line x1="22" y1="44" x2="34" y2="44" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />

    {/* Stamped Red Wax Seal */}
    <circle cx="44" cy="44" r="5" fill="#ef4444" stroke="#000000" strokeWidth="2" />
    <path d="M42 44 L44 42 L46 44 L44 46 Z" fill="#ffffff" />
  </svg>
);

// 7. Premium Chrome Scissors / Laser Shears Icon (Sharp Beveled Steel & Ergonomic Grip)
export const ScissorsIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="bladeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="60%" stopColor="#e2e8f0" />
        <stop offset="100%" stopColor="#94a3b8" />
      </linearGradient>
      <linearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ade80" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
    </defs>

    {/* Left Grip Handle */}
    <circle cx="18" cy="48" r="8" fill="url(#handleGrad)" stroke="#000000" strokeWidth="3" />
    <circle cx="18" cy="48" r="3.8" fill="#0e141b" stroke="#000000" strokeWidth="2" />

    {/* Right Grip Handle */}
    <circle cx="46" cy="48" r="8" fill="url(#handleGrad)" stroke="#000000" strokeWidth="3" />
    <circle cx="46" cy="48" r="3.8" fill="#0e141b" stroke="#000000" strokeWidth="2" />

    {/* Left Blade (Reaches to Top Right) */}
    <path
      d="M24 42 L32 32 L52 10 C52 10, 52 18, 38 34 Z"
      fill="url(#bladeGrad1)"
      stroke="#000000"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <line x1="32" y1="32" x2="51" y2="11" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />

    {/* Right Blade (Reaches to Top Left) */}
    <path
      d="M40 42 L32 32 L12 10 C12 10, 12 18, 26 34 Z"
      fill="url(#bladeGrad1)"
      stroke="#000000"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <line x1="32" y1="32" x2="13" y2="11" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />

    {/* Brass Center Pivot Bolt */}
    <circle cx="32" cy="32" r="3.5" fill="#facc15" stroke="#000000" strokeWidth="2" />
    <circle cx="32" cy="32" r="1.2" fill="#000000" />
  </svg>
);

// 8. Premium Fantasy Crossed Swords Clash Icon
export const SwordsClashIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    {/* Sword 1 (NW to SE) */}
    <line x1="12" y1="12" x2="52" y2="52" stroke="#000000" strokeWidth="7" strokeLinecap="round" />
    <line x1="12" y1="12" x2="52" y2="52" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
    <line x1="12" y1="12" x2="52" y2="52" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    {/* Crossguard & Pommel */}
    <line x1="44" y1="56" x2="56" y2="44" stroke="#d97706" strokeWidth="5" strokeLinecap="round" />
    <circle cx="54" cy="54" r="3.5" fill="#facc15" stroke="#000000" strokeWidth="2" />

    {/* Sword 2 (NE to SW) */}
    <line x1="52" y1="12" x2="12" y2="52" stroke="#000000" strokeWidth="7" strokeLinecap="round" />
    <line x1="52" y1="12" x2="12" y2="52" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
    <line x1="52" y1="12" x2="12" y2="52" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    {/* Crossguard & Pommel */}
    <line x1="20" y1="56" x2="8" y2="44" stroke="#d97706" strokeWidth="5" strokeLinecap="round" />
    <circle cx="10" cy="54" r="3.5" fill="#facc15" stroke="#000000" strokeWidth="2" />

    {/* Center Impact Blast Star */}
    <polygon
      points="32,22 35,28 42,32 35,36 32,42 29,36 22,32 29,28"
      fill="#facc15"
      stroke="#000000"
      strokeWidth="2"
    />
  </svg>
);

// 9. Premium Championship Trophy Cup Icon (Laurel Wreath, Star Medallion, Solid Plinth)
export const TrophyCupIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="goldCupGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#facc15" />
        <stop offset="100%" stopColor="#ca8a04" />
      </linearGradient>
    </defs>

    {/* Left & Right Sculpted Handles */}
    <path
      d="M16 16 C8 16, 8 32, 20 34 M48 16 C56 16, 56 32, 44 34"
      stroke="#000000"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M16 16 C8 16, 8 32, 20 34 M48 16 C56 16, 56 32, 44 34"
      stroke="url(#goldCupGrad)"
      strokeWidth="3"
      strokeLinecap="round"
    />

    {/* Main Gold Chalice */}
    <path
      d="M16 10 L48 10 L46 34 C46 42, 38 48, 32 48 C26 48, 18 42, 18 34 Z"
      fill="url(#goldCupGrad)"
      stroke="#000000"
      strokeWidth="3"
      strokeLinejoin="round"
    />

    {/* Cup Lip Rim */}
    <ellipse cx="32" cy="10" rx="16" ry="3.5" fill="#fef08a" stroke="#000000" strokeWidth="2.5" />

    {/* Center Star Medallion */}
    <circle cx="32" cy="26" r="6" fill="#b45309" stroke="#000000" strokeWidth="1.5" />
    <polygon
      points="32,22 33.5,25 37,25.5 34.5,28 35.5,31.5 32,29.5 28.5,31.5 29.5,28 27,25.5 30.5,25"
      fill="#ffffff"
    />

    {/* Stem & Tiered Pedestal Base */}
    <rect x="29" y="48" width="6" height="6" fill="#b45309" stroke="#000000" strokeWidth="2.5" />
    <rect x="18" y="54" width="28" height="6" rx="2" fill="#451a03" stroke="#000000" strokeWidth="2.5" />
    <rect x="22" y="55" width="20" height="2" fill="#d97706" />
  </svg>
);

// 10. Premium Luxury Gift Box Icon (Silk Ribbon, Fluffy 3D Bow)
export const GiftRewardIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="giftBoxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ade80" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
      <linearGradient id="giftRibbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="100%" stopColor="#eab308" />
      </linearGradient>
    </defs>

    {/* Box Base */}
    <rect x="10" y="24" width="44" height="34" rx="4" fill="url(#giftBoxGrad)" stroke="#000000" strokeWidth="3" />

    {/* Box Lid */}
    <rect x="7" y="16" width="50" height="10" rx="3" fill="#16a34a" stroke="#000000" strokeWidth="3" />

    {/* Vertical Gold Ribbon */}
    <rect x="28" y="16" width="8" height="42" fill="url(#giftRibbonGrad)" stroke="#000000" strokeWidth="2" />

    {/* Horizontal Gold Ribbon */}
    <rect x="10" y="36" width="44" height="8" fill="url(#giftRibbonGrad)" stroke="#000000" strokeWidth="2" />

    {/* Left Silk Bow Loop */}
    <path
      d="M32 16 C26 6, 14 6, 20 16 C26 16, 29 16, 32 16 Z"
      fill="url(#giftRibbonGrad)"
      stroke="#000000"
      strokeWidth="2.5"
    />

    {/* Right Silk Bow Loop */}
    <path
      d="M32 16 C38 6, 50 6, 44 16 C38 16, 35 16, 32 16 Z"
      fill="url(#giftRibbonGrad)"
      stroke="#000000"
      strokeWidth="2.5"
    />

    {/* Center Bow Knot */}
    <circle cx="32" cy="16" r="3.5" fill="#facc15" stroke="#000000" strokeWidth="2" />
  </svg>
);

// 11. Premium Steel Bank Vault Icon (Heavy Bolted Hinges, Combination Wheel)
export const BankVaultIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="vaultOuterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <linearGradient id="vaultDoorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#64748b" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>
    </defs>

    {/* Vault Outer Chassis */}
    <rect x="8" y="8" width="48" height="48" rx="8" fill="url(#vaultOuterGrad)" stroke="#000000" strokeWidth="4" />

    {/* Reinforced Vault Door */}
    <circle cx="32" cy="32" r="18" fill="url(#vaultDoorGrad)" stroke="#000000" strokeWidth="3" />

    {/* Heavy Perimeter Locking Bolts */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const bx = 32 + 14 * Math.cos(rad);
      const by = 32 + 14 * Math.sin(rad);
      return <circle key={deg} cx={bx} cy={by} r="1.5" fill="#f8fafc" stroke="#000000" strokeWidth="1" />;
    })}

    {/* Heavy Rotating Handle Wheel */}
    <circle cx="32" cy="32" r="7" fill="#facc15" stroke="#000000" strokeWidth="2.5" />
    <line x1="32" y1="18" x2="32" y2="46" stroke="#000000" strokeWidth="3" strokeLinecap="round" />
    <line x1="18" y1="32" x2="46" y2="32" stroke="#000000" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="32" r="2.5" fill="#000000" />
  </svg>
);

// 12. Premium Imperial King's Crown Icon (Velvet Cap, Inset Rubies & Sapphires)
export const CrownRankIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    <defs>
      <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="40%" stopColor="#facc15" />
        <stop offset="100%" stopColor="#ca8a04" />
      </linearGradient>
    </defs>

    {/* Crimson Velvet Inner Cap */}
    <path d="M14 48 C14 28, 50 28, 50 48 Z" fill="#991b1b" stroke="#000000" strokeWidth="2" />

    {/* Gold Crown Spires */}
    <path
      d="M10 50 L54 50 L56 22 L40 34 L32 10 L24 34 L8 22 Z"
      fill="url(#crownGold)"
      stroke="#000000"
      strokeWidth="3"
      strokeLinejoin="round"
    />

    {/* Spire Top Jewels */}
    <circle cx="8" cy="22" r="3" fill="#ef4444" stroke="#000000" strokeWidth="1.8" />
    <circle cx="32" cy="10" r="4" fill="#38bdf8" stroke="#000000" strokeWidth="2" />
    <circle cx="56" cy="22" r="3" fill="#ef4444" stroke="#000000" strokeWidth="1.8" />

    {/* Base Band Jewels */}
    <rect x="10" y="44" width="44" height="6" fill="#ca8a04" stroke="#000000" strokeWidth="2" />
    <circle cx="20" cy="47" r="2" fill="#38bdf8" stroke="#000000" strokeWidth="1" />
    <circle cx="32" cy="47" r="2" fill="#ef4444" stroke="#000000" strokeWidth="1" />
    <circle cx="44" cy="47" r="2" fill="#22c55e" stroke="#000000" strokeWidth="1" />
  </svg>
);

// 13. Premium Scalable Official GRAM Logo Vector
export const GramVectorLogo: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${className}`}
  >
    {/* Blue Squircle Base with Solid Outline */}
    <rect
      x="4"
      y="4"
      width="56"
      height="56"
      rx="16"
      fill="#2494f8"
      stroke="#000000"
      strokeWidth="3.5"
    />

    {/* Center Cut Diamond with Star Cutout */}
    <path
      d="M32 12 L48 32 L32 52 L16 32 Z"
      fill="#ffffff"
      stroke="#000000"
      strokeWidth="2"
      strokeLinejoin="round"
    />

    {/* Sparkle 4-point Star Center */}
    <path
      d="M32 20 C32 26, 32 26, 38 32 C32 32, 32 38, 32 44 C32 38, 32 32, 26 32 C32 32, 32 26, 32 20 Z"
      fill="#2494f8"
    />
  </svg>
);

// 14. Gibous Lunar Brand Suite Marks
export { GibousMoonLogo, GibousToken, GibousAppIcon } from './GibousLogo';

