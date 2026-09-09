# Game Badge Icons Design Specification

**Date**: 2026-09-09  
**Status**: Approved  
**Topic**: Use newly generated 3D sticker badges for game icons on Homepage and Lobby  

---

## 1. Context & Objectives

The platform features three real-time duel games: **Snakes & Ladders** (`snake`), **Four in a Row** (`connect4`), and **Rock Paper Scissors** (`rps`). High-fidelity 3D cartoon sticker badges were placed into `public/images/`:
- `snake.png` / `snakes-and-ladders.png`
- `connect4.png` / `four-in-a-row.png`
- `rps.png` / `rock-paper-scissors.png`

This design specification replaces legacy SVG/emoji representations on the **Homepage** and in the **Lobby** with the new badge artwork while strictly preserving the neo-brutalist hand-drawn sketch aesthetic.

---

## 2. Component Architecture

### 2.1 Reusable `GameBadge` Component
- **Path**: `src/components/ui/GameBadge.tsx`
- **Responsibility**: Centralized component mapping `GameTitle` to image asset URLs with standardized sizing and performance attributes.
- **Props**:
  - `game: GameTitle` (`'snake' | 'connect4' | 'rps'`)
  - `size?: 'xs' | 'sm' | 'md' | 'lg'` (default: `'md'`)
    - `xs`: `20x20px` (`w-5 h-5`) for tab selector buttons
    - `sm`: `28x28px` (`w-7 h-7`) for match lists and table rows
    - `md`: `48x48px` (`w-12 h-12`) for cards and headers
    - `lg`: `64x64px` (`w-16 h-16`) for banners/hero displays
  - `className?: string`
- **Behavior**:
  - Semantic `<img />` element.
  - Attributes: `loading="lazy"`, `decoding="async"`, `draggable={false}`.
  - Appropriate accessible `alt` text per game (`"Snakes & Ladders Badge"`, etc.).
  - `object-contain` to respect natural sticker proportions without distortion.

---

## 3. UI Integrations

### 3.1 Homepage (`HomeScreen.tsx` & `GameCard.tsx`)
- **File**: `src/components/home/HomeScreen.tsx`
- Replace `<SnakeIcon size={38} />`, `<Connect4Icon size={38} />`, `<ScissorsIcon size={38} />` with `<GameBadge game="snake" size="md" />`, `<GameBadge game="connect4" size="md" />`, and `<GameBadge game="rps" size="md" />`.
- **File**: `src/components/home/GameCard.tsx`
- The existing container (`w-14 h-14 sm:w-16 sm:h-16 rounded-none bg-[#f2efe9] border-2 border-black flex items-center justify-center sketch-shadow-xs`) centers the badge cleanly with `p-1`.

### 3.2 Lobby Game Type Selector (`GameTypeSelector.tsx`)
- **File**: `src/components/lobby/GameTypeSelector.tsx`
- Replace the legacy 18px SVGs with `<GameBadge game="snake" size="xs" />`, `<GameBadge game="connect4" size="xs" />`, and `<GameBadge game="rps" size="xs" />`.
- Maintain active and hover styles, borders, and text labels (`Snakes`, `Connect 4`, `R.P.S.`).

### 3.3 Lobby Featured Preview Header (`LobbyScreen.tsx`)
- **File**: `src/components/lobby/LobbyScreen.tsx`
- Add a featured card preview under "1. Choose Game" displaying the active game's badge (`size="md"`), formal title (`GAME_CONFIGS[selectedGame].displayName`), and description.

### 3.4 Lobby Open Rooms List (`LobbyScreen.tsx`)
- **File**: `src/components/lobby/LobbyScreen.tsx`
- In the active matches list, replace the raw text emoji tags with `<GameBadge game={room.gameType} size="sm" />`.

---

## 4. Verification & Testing

1. **Automated Unit & Component Tests**:
   - Add unit tests for `GameBadge.tsx` checking correct source URL mapping, size classes, and alt attributes.
   - Update any existing tests for `HomeScreen.tsx`, `GameCard.tsx`, `GameTypeSelector.tsx`, and `LobbyScreen.tsx` to verify clean mounting and rendering.
2. **Typecheck & Build**:
   - `npm run typecheck` (zero TypeScript errors).
   - `npm run build` (successful production bundle).
   - `npm test` (100% pass on Vitest test suite).
