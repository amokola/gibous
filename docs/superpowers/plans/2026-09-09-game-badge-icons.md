# Game Badge Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy SVG and emoji game representations on the Homepage and Lobby with newly generated 3D sticker badges using a reusable `GameBadge` component.

**Architecture:** A centralized `GameBadge` component maps `GameTitle` keys to `/images/*.png` static assets with standardized size presets. This is integrated into `HomeScreen`, `GameCard`, `GameTypeSelector`, and `LobbyScreen`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite 6, Vitest, React Testing Library.

---

### Task 1: Create Reusable `GameBadge` Component & Unit Tests

**Files:**
- Create: `src/components/ui/GameBadge.tsx`
- Test: `tests/unit/client/GameBadge.test.tsx`

- [ ] **Step 1: Write the failing unit tests for `GameBadge`**

```tsx
// tests/unit/client/GameBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { GameBadge } from '../../../src/components/ui/GameBadge';

describe('GameBadge Component', () => {
  it('renders correct image source and alt text for snake', () => {
    render(<GameBadge game="snake" size="md" />);
    const img = screen.getByRole('img', { name: /snakes & ladders/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/snake.png');
    expect(img.className).toContain('w-12 h-12');
  });

  it('renders correct image source and alt text for connect4', () => {
    render(<GameBadge game="connect4" size="xs" />);
    const img = screen.getByRole('img', { name: /four in a row/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/connect4.png');
    expect(img.className).toContain('w-5 h-5');
  });

  it('renders correct image source and alt text for rps', () => {
    render(<GameBadge game="rps" size="sm" />);
    const img = screen.getByRole('img', { name: /rock paper scissors/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/images/rps.png');
    expect(img.className).toContain('w-7 h-7');
  });

  it('applies custom className cleanly', () => {
    render(<GameBadge game="snake" className="custom-class" />);
    const img = screen.getByRole('img', { name: /snakes & ladders/i });
    expect(img.className).toContain('custom-class');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/client/GameBadge.test.tsx`  
Expected: FAIL ("Cannot find module ... GameBadge")

- [ ] **Step 3: Implement `GameBadge.tsx`**

```tsx
// src/components/ui/GameBadge.tsx
import React from 'react';
import { GameTitle } from '../../types/game';

export type GameBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface GameBadgeProps {
  game: GameTitle;
  size?: GameBadgeSize;
  className?: string;
  alt?: string;
}

const GAME_BADGE_URLS: Record<GameTitle, string> = {
  snake: '/images/snake.png',
  connect4: '/images/connect4.png',
  rps: '/images/rps.png',
};

const GAME_BADGE_ALTS: Record<GameTitle, string> = {
  snake: 'Snakes & Ladders Badge',
  connect4: 'Four in a Row Badge',
  rps: 'Rock Paper Scissors Badge',
};

const SIZE_CLASSES: Record<GameBadgeSize, string> = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

export const GameBadge: React.FC<GameBadgeProps> = ({
  game,
  size = 'md',
  className = '',
  alt,
}) => {
  const src = GAME_BADGE_URLS[game] || GAME_BADGE_URLS.snake;
  const defaultAlt = GAME_BADGE_ALTS[game] || 'Game Badge';

  return (
    <img
      src={src}
      alt={alt || defaultAlt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`inline-block select-none object-contain pointer-events-none drop-shadow-sm ${SIZE_CLASSES[size]} ${className}`}
    />
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/client/GameBadge.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/GameBadge.tsx tests/unit/client/GameBadge.test.tsx
git commit -m "feat(ui): create reusable GameBadge component with unit tests"
```

---

### Task 2: Integrate `GameBadge` into Homepage (`HomeScreen.tsx` & `GameCard.tsx`)

**Files:**
- Modify: `src/components/home/HomeScreen.tsx`
- Modify: `src/components/home/GameCard.tsx`

- [ ] **Step 1: Update `HomeScreen.tsx`**

Import `GameBadge` and pass it to each `GameCard`:
```tsx
import { GameBadge } from '../ui/GameBadge';
```
Replace the `icon={<SnakeIcon ... />}` props:
```tsx
            {/* 1. Snakes & Ladders */}
            <GameCard
              game="snake"
              title="Snakes & Ladders"
              subtitle="Classic race to tile 100"
              badge="Featured"
              badgeColor="bg-[#dcfce7] text-[#14532d]"
              minStake={MIN_STAKE}
              bgClass="bg-white"
              icon={<GameBadge game="snake" size="md" />}
              onPlay={onSelectAndPlayGame}
            />

            {/* 2. Connect 4 */}
            <GameCard
              game="connect4"
              title="Four in a Row"
              subtitle="Drop discs. Connect four. Win the pot."
              badge="Strategy"
              badgeColor="bg-[#e0f2fe] text-[#1a365d]"
              minStake={MIN_STAKE}
              bgClass="bg-white"
              icon={<GameBadge game="connect4" size="md" />}
              onPlay={onSelectAndPlayGame}
            />

            {/* 3. Rock Paper Scissors */}
            <GameCard
              game="rps"
              title="Rock Paper Scissors"
              subtitle="Fast best-of-three mind game"
              badge="Fast Duel"
              badgeColor="bg-[#fff9c4] text-[#854d0e]"
              minStake={MIN_STAKE}
              bgClass="bg-white"
              icon={<GameBadge game="rps" size="md" />}
              onPlay={onSelectAndPlayGame}
            />
```

- [ ] **Step 2: Ensure `GameCard.tsx` icon frame has padding for sticker presentation**

Verify `src/components/home/GameCard.tsx:40`:
```tsx
          {/* Icon Box with 2px border & sharp corners */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-none bg-[#f2efe9] border-2 border-black flex items-center justify-center p-1 sketch-shadow-xs group-hover:scale-105 transition-transform duration-150 flex-shrink-0">
            {icon}
          </div>
```

- [ ] **Step 3: Run component tests**

Run: `npm test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/home/HomeScreen.tsx src/components/home/GameCard.tsx
git commit -m "feat(home): use GameBadge sticker icons on Homepage game cards"
```

---

### Task 3: Integrate `GameBadge` into Lobby (`GameTypeSelector.tsx` & `LobbyScreen.tsx`)

**Files:**
- Modify: `src/components/lobby/GameTypeSelector.tsx`
- Modify: `src/components/lobby/LobbyScreen.tsx`

- [ ] **Step 1: Update `GameTypeSelector.tsx` with `GameBadge`**

Replace the SVG icons inside the tab buttons with `<GameBadge game="snake" size="xs" />`, `<GameBadge game="connect4" size="xs" />`, and `<GameBadge game="rps" size="xs" />`:
```tsx
// src/components/lobby/GameTypeSelector.tsx
import React from 'react';
import { GameTitle } from '../../types/game';
import { GameBadge } from '../ui/GameBadge';

interface GameTypeSelectorProps {
  selectedGame: GameTitle;
  onSelectGame: (game: GameTitle) => void;
}

export const GameTypeSelector: React.FC<GameTypeSelectorProps> = ({
  selectedGame,
  onSelectGame,
}) => {
  return (
    <div className="w-full grid grid-cols-3 gap-2 bg-[#f2efe9] p-1.5 rounded-2xl border-2 border-black sketch-shadow-xs select-none mb-3">
      {/* Snake & Ladder Tab */}
      <button
        type="button"
        onClick={() => onSelectGame('snake')}
        className={`py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 ${
          selectedGame === 'snake'
            ? 'bg-[#9b2c2c] text-white border-black sketch-shadow-xs scale-[1.02]'
            : 'text-[#1a1a1a]/60 border-transparent hover:text-[#1a1a1a]'
        }`}
      >
        <GameBadge game="snake" size="xs" />
        <span className="truncate">Snakes</span>
      </button>

      {/* Four in a Row Tab */}
      <button
        type="button"
        onClick={() => onSelectGame('connect4')}
        className={`py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 ${
          selectedGame === 'connect4'
            ? 'bg-[#1a365d] text-white border-black sketch-shadow-xs scale-[1.02]'
            : 'text-[#1a1a1a]/60 border-transparent hover:text-[#1a1a1a]'
        }`}
      >
        <GameBadge game="connect4" size="xs" />
        <span className="truncate">Connect 4</span>
      </button>

      {/* Rock Paper Scissors Tab */}
      <button
        type="button"
        onClick={() => onSelectGame('rps')}
        className={`py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 ${
          selectedGame === 'rps'
            ? 'bg-[#fff9c4] text-[#1a1a1a] border-black sketch-shadow-xs scale-[1.02]'
            : 'text-[#1a1a1a]/60 border-transparent hover:text-[#1a1a1a]'
        }`}
      >
        <GameBadge game="rps" size="xs" />
        <span className="truncate">R.P.S.</span>
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Update `LobbyScreen.tsx` with Featured Preview & Room Thumbnails**

Import `GameBadge` and `GAME_CONFIGS` from shared:
```tsx
import { GameBadge } from '../ui/GameBadge';
import { GAME_CONFIGS } from '../../../shared';
```

In Create Duel section (under "1. Choose Game"):
```tsx
              {/* Featured Game Preview Banner */}
              <div className="flex items-center gap-3 p-2 bg-[#f2efe9] border-2 border-black rounded-none mb-3 sketch-shadow-xs">
                <div className="w-12 h-12 rounded-none bg-white border border-black flex items-center justify-center p-0.5 shrink-0">
                  <GameBadge game={selectedGame} size="md" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-sketch text-sm font-bold text-[#1a1a1a] truncate">
                    {GAME_CONFIGS[selectedGame]?.displayName || selectedGame}
                  </span>
                  <span className="font-sketch text-[11px] text-[#1a1a1a]/70 truncate">
                    {GAME_CONFIGS[selectedGame]?.description}
                  </span>
                </div>
              </div>
```

In Open Rooms list:
Replace the emoji tags in each open match row with `<GameBadge game={room.gameType} size="sm" />`:
```tsx
                        <div className="flex items-center gap-1.5">
                          <GameBadge game={room.gameType} size="xs" />
                          <span className="font-sketch text-xs font-bold text-[#1a1a1a]">
                            {room.hostName}
                          </span>
                          <span className="text-[9px] font-sketch bg-[#f2efe9] px-1.5 py-0.2 border border-black/40 text-[#1a365d] uppercase font-bold">
                            {GAME_CONFIGS[room.gameType]?.shortName || room.gameType}
                          </span>
                        </div>
```

- [ ] **Step 3: Run Lobby component tests**

Run: `npx vitest run tests/component/lobby/LobbyScreen.test.tsx`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/lobby/GameTypeSelector.tsx src/components/lobby/LobbyScreen.tsx
git commit -m "feat(lobby): integrate GameBadge into game selector, preview card, and open room items"
```

---

### Task 4: End-to-End Verification & Validation

**Files:**
- None (system-wide checks)

- [ ] **Step 1: Run TypeScript typecheck**

Run: `npm run typecheck`  
Expected: PASS (0 errors client & server)

- [ ] **Step 2: Run complete Vitest suite**

Run: `npm test`  
Expected: All test suites PASS (100%)

- [ ] **Step 3: Run Vite production build**

Run: `npm run build`  
Expected: Bundle succeeds in `dist/` with 0 errors
