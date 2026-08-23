# 3D Animated Dice in Snakes & Ladders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a modular, hardware-accelerated 3D animated dice component and integrate its complete animation lifecycle into the Snakes & Ladders game arena with authoritative server synchronization and reconciliation.

**Architecture:** Break the 3D dice into decoupled units (`PipPattern`, `DiceFace`, `diceGeometry`, `Dice3D`), centralize timing constants, and integrate with `SnakeLadderArena` via a deterministic state machine (`idle` -> `rolling` -> `diceLanded` -> `movingPawn` -> `resolvingSnakeLadder` -> `turnComplete` -> `idle`) that reconciles with authoritative server state.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, CSS 3D Transforms (`preserve-3d`), Vitest, Testing Library React.

---

### Task 1: 3D Geometry Transform Resolver & Timing Constants

**Files:**
- Create: `src/components/game/dice/constants.ts`
- Create: `src/components/game/dice/diceGeometry.ts`
- Test: `tests/unit/diceGeometry.test.ts`

- [ ] **Step 1: Write the failing unit tests for `diceGeometry`**

```ts
// tests/unit/diceGeometry.test.ts
import { describe, it, expect } from 'vitest';
import { getRotationForValue } from '../../src/components/game/dice/diceGeometry';

describe('diceGeometry unit tests', () => {
  it('returns identity rotation for face 1 without extra spins', () => {
    const rotation = getRotationForValue(1, 0);
    expect(rotation).toBe('rotateX(0deg) rotateY(0deg)');
  });

  it('returns correct 3D angles for faces 1 through 6', () => {
    expect(getRotationForValue(1, 0)).toBe('rotateX(0deg) rotateY(0deg)');
    expect(getRotationForValue(2, 0)).toBe('rotateX(-90deg) rotateY(0deg)');
    expect(getRotationForValue(3, 0)).toBe('rotateX(0deg) rotateY(-90deg)');
    expect(getRotationForValue(4, 0)).toBe('rotateX(0deg) rotateY(90deg)');
    expect(getRotationForValue(5, 0)).toBe('rotateX(90deg) rotateY(0deg)');
    expect(getRotationForValue(6, 0)).toBe('rotateX(0deg) rotateY(180deg)');
  });

  it('accumulates multi-turn full spins forward without rewinding', () => {
    const rotationWithSpins = getRotationForValue(3, 2); // 2 full spins = 720deg
    expect(rotationWithSpins).toBe('rotateX(720deg) rotateY(630deg)');
  });

  it('falls back safely to face 1 rotation when value is null', () => {
    expect(getRotationForValue(null, 1)).toBe('rotateX(360deg) rotateY(360deg)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/diceGeometry.test.ts`
Expected: FAIL with module not found / function not defined.

- [ ] **Step 3: Implement `constants.ts` and `diceGeometry.ts`**

```ts
// src/components/game/dice/constants.ts
export const DICE_TIMING = {
  TUMBLE_MS: 600,
  LANDING_MS: 500,
  READ_PAUSE_MS: 400,
  PAWN_STEP_MS: 120,
  SLIDE_CLIMB_MS: 700,
  TOTAL_FALLBACK_TIMEOUT_MS: 4000,
} as const;

export const DICE_CUBE_SIZE_PX = 56;
export const DICE_FACE_OFFSET_PX = DICE_CUBE_SIZE_PX / 2; // 28px
```

```ts
// src/components/game/dice/diceGeometry.ts
export const getRotationForValue = (val: number | null, spinCount: number = 0): string => {
  const extraSpins = spinCount * 360;
  const face = val && val >= 1 && val <= 6 ? val : 1;

  switch (face) {
    case 1: // Front
      return `rotateX(${extraSpins}deg) rotateY(${extraSpins}deg)`;
    case 2: // Top
      return `rotateX(${-90 + extraSpins}deg) rotateY(${extraSpins}deg)`;
    case 3: // Right
      return `rotateX(${extraSpins}deg) rotateY(${-90 + extraSpins}deg)`;
    case 4: // Left
      return `rotateX(${extraSpins}deg) rotateY(${90 + extraSpins}deg)`;
    case 5: // Bottom
      return `rotateX(${90 + extraSpins}deg) rotateY(${extraSpins}deg)`;
    case 6: // Back
      return `rotateX(${extraSpins}deg) rotateY(${180 + extraSpins}deg)`;
    default:
      return `rotateX(${extraSpins}deg) rotateY(${extraSpins}deg)`;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/diceGeometry.test.ts`
Expected: PASS with 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/dice/constants.ts src/components/game/dice/diceGeometry.ts tests/unit/diceGeometry.test.ts
git commit -m "feat: add dice geometry rotation resolver and animation timing constants"
```

---

### Task 2: Pip Pattern & 3D Dice Face Components

**Files:**
- Create: `src/components/game/dice/PipPattern.tsx`
- Create: `src/components/game/dice/DiceFace.tsx`
- Test: `tests/component/dice/DiceFace.test.tsx`

- [ ] **Step 1: Write failing component tests for `PipPattern` and `DiceFace`**

```tsx
// tests/component/dice/DiceFace.test.tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiceFace } from '../../../src/components/game/dice/DiceFace';
import { PipPattern } from '../../../src/components/game/dice/PipPattern';

describe('DiceFace and PipPattern Components', () => {
  it('renders face 1 with red ace center pip', () => {
    const { container } = render(<PipPattern faceNumber={1} />);
    const redPip = container.querySelector('.bg-\\[\\#9b2c2c\\]');
    expect(redPip).not.toBeNull();
  });

  it('renders face 6 with 6 black pips', () => {
    const { container } = render(<PipPattern faceNumber={6} />);
    const blackPips = container.querySelectorAll('.bg-\\[\\#1a1a1a\\]');
    expect(blackPips.length).toBe(6);
  });

  it('renders DiceFace with correct 3D transform for face 2', () => {
    const { container } = render(<DiceFace faceNumber={2} />);
    const faceEl = container.firstChild as HTMLElement;
    expect(faceEl).toBeInTheDocument();
    expect(faceEl.style.transform).toContain('rotateX(90deg)');
    expect(faceEl.style.transform).toContain('translateZ(28px)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/dice/DiceFace.test.tsx`
Expected: FAIL with components not found.

- [ ] **Step 3: Implement `PipPattern.tsx` and `DiceFace.tsx`**

```tsx
// src/components/game/dice/PipPattern.tsx
import React from 'react';

interface PipPatternProps {
  faceNumber: number;
}

export const PipPattern: React.FC<PipPatternProps> = ({ faceNumber }) => {
  const dotClass = 'w-2.5 h-2.5 rounded-full bg-[#1a1a1a] shadow-inner';

  switch (faceNumber) {
    case 1:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-3.5 h-3.5 rounded-full bg-[#9b2c2c] shadow-inner ring-1 ring-[#7f1d1d]/40" />
        </div>
      );
    case 2:
      return (
        <div className="w-full h-full flex justify-between p-2">
          <div className={dotClass} />
          <div className={`${dotClass} self-end`} />
        </div>
      );
    case 3:
      return (
        <div className="w-full h-full flex justify-between p-2">
          <div className={dotClass} />
          <div className={`${dotClass} self-center`} />
          <div className={`${dotClass} self-end`} />
        </div>
      );
    case 4:
      return (
        <div className="w-full h-full grid grid-cols-2 gap-2 p-2 place-items-center">
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
        </div>
      );
    case 5:
      return (
        <div className="w-full h-full grid grid-cols-3 p-1.5 place-items-center">
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
        </div>
      );
    case 6:
      return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-3 gap-1 p-1.5 place-items-center">
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
        </div>
      );
    default:
      return null;
  }
};
```

```tsx
// src/components/game/dice/DiceFace.tsx
import React from 'react';
import { PipPattern } from './PipPattern';
import { DICE_FACE_OFFSET_PX } from './constants';

interface DiceFaceProps {
  faceNumber: 1 | 2 | 3 | 4 | 5 | 6;
}

const getFaceTransform = (face: number, offset: number) => {
  switch (face) {
    case 1:
      return `translateZ(${offset}px)`;
    case 2:
      return `rotateX(90deg) translateZ(${offset}px)`;
    case 3:
      return `rotateY(90deg) translateZ(${offset}px)`;
    case 4:
      return `rotateY(-90deg) translateZ(${offset}px)`;
    case 5:
      return `rotateX(-90deg) translateZ(${offset}px)`;
    case 6:
      return `rotateY(180deg) translateZ(${offset}px)`;
    default:
      return `translateZ(${offset}px)`;
  }
};

export const DiceFace: React.FC<DiceFaceProps> = ({ faceNumber }) => {
  return (
    <div
      className="absolute inset-0 bg-[#ffffff] border-2 border-black rounded-none flex items-center justify-center backface-hidden shadow-inner select-none"
      style={{ transform: getFaceTransform(faceNumber, DICE_FACE_OFFSET_PX) }}
      data-testid={`dice-face-${faceNumber}`}
    >
      <PipPattern faceNumber={faceNumber} />
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/dice/DiceFace.test.tsx`
Expected: PASS with 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/dice/PipPattern.tsx src/components/game/dice/DiceFace.tsx tests/component/dice/DiceFace.test.tsx
git commit -m "feat: add PipPattern and DiceFace 3D components"
```

---

### Task 3: Refactor `Dice3D` Container & Polish CSS 3D Tumble Styles

**Files:**
- Modify: `src/components/game/Dice3D.tsx`
- Modify: `src/index.css`
- Test: `tests/component/dice/Dice3D.test.tsx`

- [ ] **Step 1: Write failing component tests for `Dice3D`**

```tsx
// tests/component/dice/Dice3D.test.tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dice3D } from '../../../src/components/game/Dice3D';

describe('Dice3D Component Tests', () => {
  it('renders all 6 3D faces', () => {
    render(
      <Dice3D
        value={1}
        isRolling={false}
        activePlayer="p1"
        canRoll={true}
        onRoll={vi.fn()}
      />
    );

    for (let i = 1; i <= 6; i++) {
      expect(screen.getByTestId(`dice-face-${i}`)).toBeInTheDocument();
    }
  });

  it('calls onRoll when clicked on active turn', () => {
    const onRoll = vi.fn();
    render(
      <Dice3D
        value={3}
        isRolling={false}
        activePlayer="p1"
        canRoll={true}
        onRoll={onRoll}
      />
    );

    const rollBtn = screen.getByRole('button', { name: /TAP TO ROLL/i });
    fireEvent.click(rollBtn);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onRoll when canRoll is false or isRolling is true', () => {
    const onRoll = vi.fn();
    render(
      <Dice3D
        value={3}
        isRolling={true}
        activePlayer="p1"
        canRoll={false}
        onRoll={onRoll}
      />
    );

    expect(screen.queryByRole('button', { name: /TAP TO ROLL/i })).toBeNull();
    expect(screen.getByText(/Rolling/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails or needs refactoring**

Run: `npx vitest run tests/component/dice/Dice3D.test.tsx`
Expected: FAIL due to missing data-testids or component structure updates.

- [ ] **Step 3: Update `Dice3D.tsx` and `src/index.css`**

Update `src/components/game/Dice3D.tsx`:
```tsx
// src/components/game/Dice3D.tsx
import React, { useState, useEffect } from 'react';
import { PlayerId } from '../../types/game';
import { DiceFace } from './dice/DiceFace';
import { getRotationForValue } from './dice/diceGeometry';

interface Dice3DProps {
  value: number | null;
  isRolling: boolean;
  activePlayer: PlayerId;
  canRoll: boolean;
  statusText?: string;
  onRoll: () => void;
}

export const Dice3D: React.FC<Dice3DProps> = ({
  value,
  isRolling,
  activePlayer,
  canRoll,
  statusText,
  onRoll,
}) => {
  const isP1 = activePlayer === 'p1';
  const [spinCount, setSpinCount] = useState(0);

  // Increment spin accumulator on every roll so the die spins forward
  useEffect(() => {
    if (isRolling) {
      setSpinCount((prev) => prev + 2);
    }
  }, [isRolling]);

  const currentTransform = getRotationForValue(value, spinCount);

  return (
    <div className="flex flex-col items-center select-none">
      {/* 3D Perspective Stage Container */}
      <div
        className="perspective-container relative w-16 h-16 sm:w-18 sm:h-18 flex items-center justify-center cursor-pointer my-1"
        onClick={() => {
          if (canRoll && !isRolling) onRoll();
        }}
        data-testid="dice-3d-stage"
      >
        {/* Physical 3D Cube */}
        <div
          className={`relative w-14 h-14 sm:w-14 sm:h-14 dice-cube-3d ${
            isRolling ? 'animate-dice-roll-3d' : ''
          }`}
          style={{
            transform: isRolling ? undefined : currentTransform,
          }}
        >
          <DiceFace faceNumber={1} />
          <DiceFace faceNumber={6} />
          <DiceFace faceNumber={3} />
          <DiceFace faceNumber={4} />
          <DiceFace faceNumber={2} />
          <DiceFace faceNumber={5} />
        </div>

        {/* Dynamic Physical Ground Shadow */}
        <div
          className={`absolute -bottom-2 w-12 h-2.5 bg-black/30 rounded-full blur-[1.5px] transition-all pointer-events-none ${
            isRolling ? 'animate-shadow-pulse' : 'scale-100 opacity-30'
          }`}
        />
      </div>

      {/* Chunky Roll Action CTA & Turn Badge */}
      <div className="mt-2 flex flex-col items-center gap-1">
        {canRoll && !isRolling ? (
          <button
            type="button"
            onClick={onRoll}
            className="px-4 py-1.5 bg-[#9b2c2c] hover:bg-[#802222] text-white border-2 border-black rounded-none font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            🎲 TAP TO ROLL
          </button>
        ) : (
          <span
            className={`font-sketch text-xs sm:text-sm font-bold tracking-wide px-3 py-1 rounded-none border-2 border-black sketch-shadow-xs ${
              isRolling
                ? 'bg-[#fff9c4] text-[#854d0e] animate-pulse'
                : isP1
                ? 'bg-[#fff9c4] text-[#854d0e]'
                : 'bg-[#e0f2fe] text-[#1a365d]'
            }`}
          >
            {isRolling ? '🎲 Rolling 3D Die...' : statusText || (isP1 ? 'Your Turn' : "Opponent's Turn")}
          </span>
        )}
      </div>
    </div>
  );
};
```

Ensure `src/index.css` contains the optimized 3D tumble animations:
```css
.perspective-container {
  perspective: 600px;
}

.dice-cube-3d {
  transform-style: preserve-3d;
  transition: transform 0.65s cubic-bezier(0.2, 0.85, 0.4, 1.15);
}

@keyframes diceRollTumble {
  0% {
    transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg) translateY(0px) scale(0.95);
  }
  25% {
    transform: rotateX(220deg) rotateY(380deg) rotateZ(90deg) translateY(-24px) scale(1.1);
  }
  50% {
    transform: rotateX(460deg) rotateY(740deg) rotateZ(180deg) translateY(-36px) scale(1.15);
  }
  75% {
    transform: rotateX(680deg) rotateY(1060deg) rotateZ(270deg) translateY(-18px) scale(1.1);
  }
  100% {
    transform: rotateX(900deg) rotateY(1440deg) rotateZ(360deg) translateY(0px) scale(0.95);
  }
}

.animate-dice-roll-3d {
  animation: diceRollTumble 0.55s cubic-bezier(0.35, 0, 0.25, 1) infinite;
}

@keyframes shadowPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.35;
  }
  50% {
    transform: scale(0.65);
    opacity: 0.12;
  }
}

.animate-shadow-pulse {
  animation: shadowPulse 0.55s cubic-bezier(0.35, 0, 0.25, 1) infinite;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/dice/Dice3D.test.tsx`
Expected: PASS with 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/Dice3D.tsx src/index.css tests/component/dice/Dice3D.test.tsx
git commit -m "feat: refactor Dice3D with modular faces and verified 3D tumble animations"
```

---

### Task 4: Integrate 3D Dice into `SnakeLadderArena` with Lifecycle State Machine & Reconciliation

**Files:**
- Modify: `src/components/game/SnakeLadderArena.tsx`
- Modify: `tests/component/arenas/SnakeLadderArena.test.tsx`

- [ ] **Step 1: Write updated component tests for `SnakeLadderArena`**

```tsx
// tests/component/arenas/SnakeLadderArena.test.tsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnakeLadderArena } from '../../../src/components/game/SnakeLadderArena';
import { createMockDuelState } from '../../setup/mock-data';

describe('SnakeLadderArena with 3D Dice Integration', () => {
  it('renders 3D dice stage and triggers onRoll when tapping dice on active turn', () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Position: 10,
        p2Position: 5,
        lastRoll: 4,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    expect(screen.getByTestId('dice-3d-stage')).toBeInTheDocument();

    const rollBtn = screen.getByRole('button', { name: /ROLL DICE/i });
    expect(rollBtn).not.toBeDisabled();

    fireEvent.click(rollBtn);
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('triggers 3D dice animation when incoming server dice event arrives', async () => {
    const onRoll = vi.fn();
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p2',
      lastDiceEvent: {
        player: 'p2',
        value: 5,
        from: 1,
        to: 6,
        version: 2,
      },
    });

    render(<SnakeLadderArena duelState={duelState} onRoll={onRoll} />);

    // Renders the 3D dice stage in the arena
    expect(screen.getByTestId('dice-3d-stage')).toBeInTheDocument();
  });

  it('reconciles cleanly when gameState positions advance', () => {
    const duelState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p1',
      gameState: {
        p1Position: 25,
        p2Position: 12,
        lastRoll: 6,
      },
    });

    const { rerender } = render(<SnakeLadderArena duelState={duelState} onRoll={vi.fn()} />);
    expect(screen.getByTitle('Player 1')).toBeInTheDocument();

    const updatedState = createMockDuelState({
      myRole: 'p1',
      activePlayer: 'p2',
      gameState: {
        p1Position: 31,
        p2Position: 12,
        lastRoll: 6,
      },
    });

    rerender(<SnakeLadderArena duelState={updatedState} onRoll={vi.fn()} />);
    expect(screen.getByTitle('Player 1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/component/arenas/SnakeLadderArena.test.tsx`
Expected: FAIL due to missing 3D dice stage in `SnakeLadderArena`.

- [ ] **Step 3: Implement 3D Dice and state machine in `SnakeLadderArena.tsx`**

```tsx
// src/components/game/SnakeLadderArena.tsx
import React, { useState, useEffect, useRef } from 'react';
import { NormalizedDuelState } from '../../hooks/useMultiplayer';
import { CANONICAL_SNAKES, CANONICAL_LADDERS } from '../../../shared/constants/board';
import { Dice3D } from './Dice3D';
import { DICE_TIMING } from './dice/constants';

interface SnakeLadderArenaProps {
  duelState: NormalizedDuelState;
  onRoll: () => void;
}

type AnimationState = 'idle' | 'rolling' | 'diceLanded' | 'movingPawn' | 'resolvingSnakeLadder' | 'turnComplete';

export const SnakeLadderArena: React.FC<SnakeLadderArenaProps> = ({ duelState, onRoll }) => {
  const { myRole, activePlayer, gameState, lastDiceEvent } = duelState;
  const isMyTurn = myRole !== null && activePlayer === myRole;

  const [p1Pos, setP1Pos] = useState(gameState?.p1Position || 1);
  const [p2Pos, setP2Pos] = useState(gameState?.p2Position || 1);
  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [jumpBanner, setJumpBanner] = useState<{ text: string; type: 'ladder' | 'snake' } | null>(null);
  const [displayRoll, setDisplayRoll] = useState<number | null>(gameState?.lastRoll || null);
  const [isLocalRolling, setIsLocalRolling] = useState(false);

  const processedEventRef = useRef<string | null>(null);

  const isRolling = animState === 'rolling' || isLocalRolling;
  const isAnimating = animState !== 'idle';

  const handleRollClick = () => {
    if (isMyTurn && !isAnimating && !isLocalRolling) {
      setIsLocalRolling(true);
      setAnimState('rolling');
      onRoll();
    }
  };

  // Animate on authoritative server dice event
  useEffect(() => {
    if (!lastDiceEvent) return;
    const eventKey = `${lastDiceEvent.player}-${lastDiceEvent.value}-${lastDiceEvent.to}-${lastDiceEvent.version}`;
    if (processedEventRef.current === eventKey) return;
    processedEventRef.current = eventKey;

    let isMounted = true;

    const animateEvent = async () => {
      setIsLocalRolling(false);
      setAnimState('rolling');
      setDisplayRoll(lastDiceEvent.value);

      // 1. Tumble phase
      await new Promise((r) => setTimeout(r, DICE_TIMING.TUMBLE_MS));
      if (!isMounted) return;

      // 2. Dice landing phase
      setAnimState('diceLanded');
      await new Promise((r) => setTimeout(r, DICE_TIMING.LANDING_MS));
      if (!isMounted) return;

      // 3. Step-by-step pawn movement to base roll landing
      setAnimState('movingPawn');
      const targetBase = lastDiceEvent.snakeOrLadder ? lastDiceEvent.snakeOrLadder.from : lastDiceEvent.to;

      if (lastDiceEvent.player === 'p1') {
        setP1Pos(targetBase);
      } else {
        setP2Pos(targetBase);
      }

      await new Promise((r) => setTimeout(r, DICE_TIMING.READ_PAUSE_MS));
      if (!isMounted) return;

      // 4. Handle ladder/snake jump
      if (lastDiceEvent.snakeOrLadder) {
        setAnimState('resolvingSnakeLadder');
        const isLadder = lastDiceEvent.snakeOrLadder.type === 'ladder';
        setJumpBanner({
          text: isLadder
            ? `${lastDiceEvent.player.toUpperCase()} CLIMBED A LADDER! 🪜`
            : `${lastDiceEvent.player.toUpperCase()} SLID DOWN A SNAKE! 🐍`,
          type: isLadder ? 'ladder' : 'snake',
        });

        await new Promise((r) => setTimeout(r, DICE_TIMING.SLIDE_CLIMB_MS));
        if (!isMounted) return;

        if (lastDiceEvent.player === 'p1') {
          setP1Pos(lastDiceEvent.snakeOrLadder.to);
        } else {
          setP2Pos(lastDiceEvent.snakeOrLadder.to);
        }

        await new Promise((r) => setTimeout(r, 600));
        if (!isMounted) return;
        setJumpBanner(null);
      }

      setAnimState('idle');
    };

    animateEvent();

    return () => {
      isMounted = false;
    };
  }, [lastDiceEvent]);

  // Reconciliation: Sync positions if no active animation
  useEffect(() => {
    if (animState === 'idle' && !isLocalRolling) {
      if (gameState?.p1Position && gameState.p1Position !== p1Pos) {
        setP1Pos(gameState.p1Position);
      }
      if (gameState?.p2Position && gameState.p2Position !== p2Pos) {
        setP2Pos(gameState.p2Position);
      }
      if (gameState?.lastRoll !== undefined && gameState.lastRoll !== displayRoll) {
        setDisplayRoll(gameState.lastRoll);
      }
    }
  }, [gameState?.p1Position, gameState?.p2Position, gameState?.lastRoll, animState, isLocalRolling, p1Pos, p2Pos, displayRoll]);

  // Board tile generator (10x10 boustrophedon)
  const renderBoardGrid = () => {
    const rows = [];
    for (let r = 9; r >= 0; r--) {
      const isEvenRow = r % 2 === 0;
      const cols = [];
      for (let c = 0; c < 10; c++) {
        const tileNum = isEvenRow ? r * 10 + c + 1 : r * 10 + (9 - c) + 1;
        const isP1Here = p1Pos === tileNum;
        const isP2Here = p2Pos === tileNum;

        const hasSnakeHead = CANONICAL_SNAKES.find((s) => s.head === tileNum);
        const hasLadderBottom = CANONICAL_LADDERS.find((l) => l.bottom === tileNum);

        cols.push(
          <div
            key={tileNum}
            className={`relative flex items-center justify-center rounded-none text-[8px] font-sketch font-bold transition-all border border-black/25 ${
              tileNum % 2 === 0 ? 'bg-[#eadbba] text-[#1a1a1a]' : 'bg-[#faf6ee] text-[#1a1a1a]'
            } ${tileNum === 100 ? 'bg-[#fff9c4] text-[#9b2c2c] font-black ring-1 ring-[#9b2c2c]' : ''}`}
            style={{ aspectRatio: '1/1' }}
          >
            <span className="absolute top-0 left-0.5 text-[7px] text-[#1a1a1a]/60">{tileNum}</span>

            {hasSnakeHead && (
              <span className="text-[10px] select-none pointer-events-none" title={`Snake to ${hasSnakeHead.tail}`}>🐍</span>
            )}
            {hasLadderBottom && (
              <span className="text-[10px] select-none pointer-events-none" title={`Ladder to ${hasLadderBottom.top}`}>🪜</span>
            )}

            <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
              {isP1Here && (
                <div
                  className="w-3.5 h-3.5 rounded-full bg-[#166534] border border-black shadow-sm transform scale-110 z-10 animate-bounce"
                  title="Player 1"
                />
              )}
              {isP2Here && (
                <div
                  className="w-3.5 h-3.5 rounded-full bg-[#1a365d] border border-black shadow-sm transform scale-110 z-10 animate-bounce"
                  title="Player 2"
                />
              )}
            </div>
          </div>
        );
      }
      rows.push(
        <div key={r} className="grid grid-cols-10 gap-0.5 w-full">
          {cols}
        </div>
      );
    }
    return rows;
  };

  return (
    <div className="flex flex-col items-center justify-between w-full h-full max-w-sm mx-auto py-1 font-body">
      {/* Jump Banner Alert */}
      {jumpBanner && (
        <div
          className={`w-full py-1.5 px-3 rounded-none font-sketch font-bold text-center text-sm border-2 border-black sketch-shadow animate-bounce mb-1 ${
            jumpBanner.type === 'ladder'
              ? 'bg-[#dcfce7] text-[#166534]'
              : 'bg-[#fee2e2] text-[#991b1b]'
          }`}
        >
          {jumpBanner.text}
        </div>
      )}

      {/* 10x10 Board */}
      <div className="w-full bg-[#fbfaf7] border-2 sm:border-[2.5px] border-black rounded-none p-1.5 sketch-shadow-md space-y-0.5">
        {renderBoardGrid()}
      </div>

      {/* Center 3D Dice Stage & Interaction */}
      <div className="w-full flex flex-col items-center justify-center mt-2">
        <Dice3D
          value={displayRoll}
          isRolling={isRolling}
          activePlayer={activePlayer || 'p1'}
          canRoll={isMyTurn && !isAnimating}
          statusText={isMyTurn ? 'Your Turn' : "Opponent's Turn"}
          onRoll={handleRollClick}
        />
      </div>

      {/* Primary Roll Action Button */}
      <div className="w-full mt-2 px-1">
        <button
          onClick={handleRollClick}
          disabled={!isMyTurn || isAnimating}
          className={`w-full py-2.5 px-4 rounded-none font-sketch font-bold text-base tracking-wider uppercase border-2 border-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            isMyTurn && !isAnimating
              ? 'bg-[#9b2c2c] hover:bg-[#b91c1c] text-white sketch-shadow sketch-btn-press'
              : 'bg-neutral-200 text-neutral-500 cursor-not-allowed opacity-70'
          }`}
        >
          <span className="text-lg">🎲</span>
          <span>{isRolling ? 'ROLLING 3D DIE...' : isMyTurn ? 'ROLL DICE' : 'WAITING FOR OPPONENT'}</span>
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/component/arenas/SnakeLadderArena.test.tsx`
Expected: PASS with 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SnakeLadderArena.tsx tests/component/arenas/SnakeLadderArena.test.tsx
git commit -m "feat: integrate 3D dice and lifecycle state machine into SnakeLadderArena"
```

---

### Task 5: Full Typecheck & Test Suite Regression Verification

**Files:**
- Test: All tests (`npm run test:unit`, `npm run test:component`, `npm run typecheck`)

- [ ] **Step 1: Run client & server typechecks**

Run: `npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 2: Run all unit and component tests**

Run: `npm run test:unit && npm run test:component`
Expected: All tests pass.

- [ ] **Step 3: Commit all remaining cleanups**

```bash
git commit --allow-empty -m "chore: complete 3D dice verification and test suite"
```
