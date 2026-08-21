import React from 'react';

interface IconProps {
  size?: number | string;
  className?: string;
}

/**
 * Gibous Primary Brand Mark:
 * Bold imperfect lunar disc with cutout 'G' and solid ink border
 */
export const GibousMoonLogo: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] ${className}`}
  >
    <defs>
      <linearGradient id="gibousMoonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="60%" stopColor="#f6c945" />
        <stop offset="100%" stopColor="#eab308" />
      </linearGradient>
    </defs>

    {/* Offset Hard Hard Shadow */}
    <circle cx="34" cy="34" r="26" fill="#141414" />

    {/* Main Lunar Disc */}
    <circle
      cx="32"
      cy="32"
      r="26"
      fill="url(#gibousMoonGrad)"
      stroke="#141414"
      strokeWidth="3.5"
    />

    {/* Gibbous Phase Crater / Dark Accent */}
    <path
      d="M48 18 C54 26, 54 38, 48 46 C42 46, 38 42, 38 32 C38 22, 42 18, 48 18 Z"
      fill="#ca8a04"
      opacity="0.3"
    />

    {/* Bold Cutout Stylized G */}
    <path
      d="M38 22 C32 18, 20 20, 18 30 C16 40, 24 46, 34 46 C42 46, 44 40, 44 34 L31 34 L31 29 L49 29 C50 38, 45 51, 32 51 C18 51, 11 41, 13 28 C15 15, 30 13, 41 18 L38 22 Z"
      fill="#141414"
    />

    {/* Lunar Disc Sparkle / Highlight */}
    <circle cx="20" cy="20" r="2" fill="#ffffff" opacity="0.8" />
  </svg>
);

/**
 * Gibous Duel Token:
 * Circular nearly-full moon token with black ink border and offset shadow
 */
export const GibousToken: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] ${className}`}
  >
    <defs>
      <linearGradient id="tokenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbfaf7" />
        <stop offset="100%" stopColor="#f2efe9" />
      </linearGradient>
    </defs>

    {/* Solid Ink Shadow */}
    <circle cx="34" cy="34" r="26" fill="#141414" />

    {/* Paper Moon Disc */}
    <circle
      cx="32"
      cy="32"
      r="26"
      fill="url(#tokenGrad)"
      stroke="#141414"
      strokeWidth="3"
    />

    {/* Inner Concentric Rim */}
    <circle
      cx="32"
      cy="32"
      r="21"
      stroke="#141414"
      strokeWidth="1.5"
      strokeDasharray="4 2"
      opacity="0.7"
    />

    {/* Moon Crescent / Gibous Shadow Phase */}
    <path
      d="M32 11 C43.6 11, 53 20.4, 53 32 C53 43.6, 43.6 53, 32 53 C26 53, 24 44, 24 32 C24 20, 26 11, 32 11 Z"
      fill="#1f3a5f"
      stroke="#141414"
      strokeWidth="1.5"
    />

    {/* Center Arena Swords Mini Mark */}
    <circle cx="27" cy="32" r="6" fill="#f6c945" stroke="#141414" strokeWidth="1.5" />
    <path d="M25 30 L29 34 M29 30 L25 34" stroke="#141414" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * Gibous App Icon:
 * Moon token on warm paper background with solid ink border
 */
export const GibousAppIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`inline-block select-none ${className}`}
  >
    {/* Warm Paper Squared Background */}
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#f2efe9" stroke="#141414" strokeWidth="3" />

    {/* Moon Shadow */}
    <circle cx="34" cy="34" r="20" fill="#141414" opacity="0.25" />

    {/* Moon Body */}
    <circle cx="32" cy="32" r="20" fill="#f6c945" stroke="#141414" strokeWidth="2.5" />

    {/* Lunar Phase Crescent */}
    <path
      d="M32 12 C43 12, 49 21, 49 32 C49 43, 43 52, 32 52 C27 52, 25 43, 25 32 C25 21, 27 12, 32 12 Z"
      fill="#1f3a5f"
      stroke="#141414"
      strokeWidth="1.5"
    />

    {/* Stylized Center Cutout G */}
    <path
      d="M33 24 C28 21, 21 24, 20 31 C19 38, 24 42, 30 42 C36 42, 38 38, 38 33 L29 33 L29 29 L41 29 C42 36, 39 45, 29 45 C19 45, 15 37, 16 29 C17 20, 27 17, 35 20 Z"
      fill="#ffffff"
    />
  </svg>
);
