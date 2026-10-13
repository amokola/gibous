import React from 'react';

interface IconProps {
  size?: number | string;
  className?: string;
}

interface AssetIconProps extends IconProps {
  src: string;
}

const AssetIcon: React.FC<AssetIconProps> = ({ src, size = 36, className = '' }) => (
  <img
    src={src}
    width={size}
    height={size}
    alt=""
    aria-hidden="true"
    draggable={false}
    className={`inline-block select-none object-contain ${className}`}
  />
);

// 1. Bold, readable snake mark for compact game cards.
export const SnakeIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className={`inline-block select-none ${className}`}
  >
    <path d="M12 48C8 38 18 31 29 34C41 37 52 29 49 18C47 10 39 7 31 11" stroke="#000" strokeWidth="14" strokeLinecap="round" />
    <path d="M12 48C8 38 18 31 29 34C41 37 52 29 49 18C47 10 39 7 31 11" stroke="#22c55e" strokeWidth="9" strokeLinecap="round" />
    <path d="M15 45C14 40 20 36 28 37C40 39 49 31 47 20" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
    <path d="M31 11C29 6 21 5 18 10C15 15 19 20 25 20C30 20 33 16 31 11Z" fill="#4ade80" stroke="#000" strokeWidth="2.5" />
    <circle cx="24" cy="11" r="2.4" fill="#facc15" stroke="#000" strokeWidth="1.2" />
    <circle cx="24" cy="11" r="0.8" fill="#000" />
    <path d="M19 15L11 18M11 18L7 15M11 18L7 21" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);



// 4. Clear Connect 4 board mark with an unmistakable winning line.
export const Connect4Icon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className={`inline-block select-none ${className}`}
  >
    <rect x="7" y="9" width="50" height="46" rx="5" fill="#1e3a8a" stroke="#000" strokeWidth="3" />
    <path d="M13 55L9 60M51 55L55 60" stroke="#000" strokeWidth="4" strokeLinecap="round" />
    <g fill="#0f172a" stroke="#000" strokeWidth="1.5">
      <circle cx="17" cy="19" r="4.5" /><circle cx="29" cy="19" r="4.5" /><circle cx="41" cy="19" r="4.5" /><circle cx="49" cy="19" r="4.5" />
      <circle cx="17" cy="31" r="4.5" /><circle cx="29" cy="31" r="4.5" /><circle cx="41" cy="31" r="4.5" /><circle cx="49" cy="31" r="4.5" />
      <circle cx="17" cy="43" r="4.5" /><circle cx="29" cy="43" r="4.5" /><circle cx="41" cy="43" r="4.5" /><circle cx="49" cy="43" r="4.5" />
    </g>
    <path d="M17 43L29 31L41 19" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
    <circle cx="17" cy="43" r="4.5" fill="#4ade80" stroke="#000" strokeWidth="1.5" />
    <circle cx="29" cy="31" r="4.5" fill="#4ade80" stroke="#000" strokeWidth="1.5" />
    <circle cx="41" cy="19" r="4.5" fill="#4ade80" stroke="#000" strokeWidth="1.5" />
  </svg>
);

// 5. Premium Meteorite Rock / Fist Icon (Crystalline Facets, Sharp Ink Cuts)
export const RockIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <AssetIcon src="/images/icons/rps/rock.svg" size={size} className={className} />
);

// 6. Premium Blueprint / Origami Paper Icon (Wax Seal, Ruled Ink Lines, Corner Fold)
export const PaperIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <AssetIcon src="/images/icons/rps/paper.svg" size={size} className={className} />
);

// 7. Bold scissors mark with clean blades and high-contrast handles.
export const ScissorsIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <AssetIcon src="/images/icons/rps/scissors.svg" size={size} className={className} />
);

// 8. Premium Fantasy Crossed Swords Clash Icon
export const SwordsClashIcon: React.FC<IconProps> = ({ size = 36, className = '' }) => (
  <AssetIcon src="/images/icons/weapons.svg" size={size} className={className} />
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
  <AssetIcon src="/images/icons/vault.svg" size={size} className={className} />
);

export const WalletDepositIcon: React.FC<IconProps> = ({ size = 40, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="butt"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={`inline-block select-none ${className}`}
  >
    <path d="M22 13L22 2L2 2L2 16L13 16M14 9C14 10.1046 13.1046 11 12 11C10.8954 11 10 10.1046 10 9C10 7.8954 10.8954 7 12 7C13.1046 7 14 7.8954 14 9ZM18 2C18 3.3333 18.8 6 22 6M6 16C6 14.6667 5.2 12 2 12M6 2C6 3.3333 5.2 6 2 6M19 15L19 23M23 19L15 19" />
  </svg>
);

export const WalletWithdrawIcon: React.FC<IconProps> = ({ size = 40, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="butt"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={`inline-block select-none ${className}`}
  >
    <path d="M22 13L22 2L2 2L2 16L13 16M14 9C14 10.1046 13.1046 11 12 11C10.8954 11 10 10.1046 10 9C10 7.8954 10.8954 7 12 7C13.1046 7 14 7.8954 14 9ZM18 2C18 3.3333 18.8 6 22 6M6 16C6 14.6667 5.2 12 2 12M6 2C6 3.3333 5.2 6 2 6M23 19L15 19" />
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

