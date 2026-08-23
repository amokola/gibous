# 3D Animated Dice in Snakes & Ladders Design Specification

## Overview
This specification details the implementation of a 3D animated dice component and its animation lifecycle integration into the Snakes & Ladders game arena ([`SnakeLadderArena.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/game/SnakeLadderArena.tsx)).

The goal is to replace the static 2D roll display with an interactive, hardware-accelerated 3D cube matching the retro hand-drawn sketch aesthetic, while strictly keeping the server authoritative over all game state and dice outcomes.

---

## 1. Core Principle
> **The server controls what happened; the client controls how it looks.**

* **Server Authority**: The server alone generates random dice values, starting positions, landing tiles, and snake/ladder results.
* **Client Presentation**: The client visualizes this authoritative payload smoothly (3D tumbling, landing, pawn hops, snake/ladder slides, jump banners) without calculating its own divergent outcomes.

---

## 2. Component Architecture & Decomposition

To keep components modular, testable, and maintainable, the 3D dice system is structured into focused units:

```text
Dice3D (Container / Perspective Stage)
 ├── DiceFace (6 textured 3D faces with geometry offsets)
 │    └── PipPattern (positioned ink pip elements & distinct red ace)
 ├── Dynamic Ground Shadow (synced with jump height and air time)
 └── getRotationForValue (pure transform resolver from authoritative value)
```

### Component Roles
* **`Dice3D`** ([`src/components/game/Dice3D.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/game/Dice3D.tsx)):
  * Houses the 3D perspective stage (`perspective: 600px`).
  * Manages spin accumulation so rolls always tumble forward across multiple rotations without rewinding.
  * Handles direct tap-to-roll user interaction when rolling is permissible.
  * Synchronizes 3D tumbling classes and resting orientation styles.
* **`DiceFace`** (`src/components/game/dice/DiceFace.tsx`):
  * Renders individual 3D cube faces (`56px × 56px`) with half-size offset `translateZ(28px)` and coordinate transforms.
  * Adheres to the hand-drawn sketch visual theme (crisp off-white `#ffffff` face, dark ink borders, subtle bevel, and inner shadow).
* **`PipPattern`** (`src/components/game/dice/PipPattern.tsx`):
  * Renders cleanly positioned DOM elements for pips 1 through 6.
  * Face 1: Large center red pip (`#9b2c2c`).
  * Faces 2–6: Solid black ink pips (`#1a1a1a`) configured in classic dice geometry (corners, diagonals, parallel rows).
* **`getRotationForValue`** (`src/components/game/dice/diceGeometry.ts`):
  * Pure function mapping face values (1–6) and spin counts to exact 3D rotation strings.

---

## 3. 3D Geometry & Rotation Mapping

For a cube of dimension $S = 56\text{px}$, the face distance from the center is $D = 28\text{px}$.

### Face Placement & Resting Orientation

```text
Value 1 → Front
Value 2 → Top
Value 3 → Right
Value 4 → Left
Value 5 → Bottom
Value 6 → Back
```

| Face Value | Physical Face Transform | Cube Target Rotation to Show Face | Pip Style |
| :--- | :--- | :--- | :--- |
| **1 (Front)** | `translateZ(28px)` | `rotateX(0deg) rotateY(0deg)` | Red Ace (`#9b2c2c`) |
| **2 (Top)** | `rotateX(90deg) translateZ(28px)` | `rotateX(-90deg) rotateY(0deg)` | 2 Black Pips |
| **3 (Right)** | `rotateY(90deg) translateZ(28px)` | `rotateX(0deg) rotateY(-90deg)` | 3 Black Pips |
| **4 (Left)** | `rotateY(-90deg) translateZ(28px)` | `rotateX(0deg) rotateY(90deg)` | 4 Black Pips |
| **5 (Bottom)** | `rotateX(-90deg) translateZ(28px)` | `rotateX(90deg) rotateY(0deg)` | 5 Black Pips |
| **6 (Back)** | `rotateY(180deg) translateZ(28px)` | `rotateX(0deg) rotateY(180deg)` | 6 Black Pips |

*Accumulated full rotations ($N \times 360^\circ$) are appended on every roll so that each throw produces a continuous forward tumble rather than an abrupt reverse spin.*

---

## 4. Animation Timing & Physics Constants

Animation duration constants are centralized in `src/components/game/dice/constants.ts`:

```ts
export const DICE_TIMING = {
  TUMBLE_MS: 600,
  LANDING_MS: 500,
  READ_PAUSE_MS: 400,
  PAWN_STEP_MS: 120,
  SLIDE_CLIMB_MS: 700,
  TOTAL_FALLBACK_TIMEOUT_MS: 4000,
} as const;
```

### 3D Tumble Keyframes (`dice-roll-tumble`)
* Multi-axis tumble: `rotateX(0deg) rotateY(0deg) rotateZ(0deg) translateY(0px)` to `rotateX(900deg) rotateY(1440deg) rotateZ(360deg) translateY(0px)`.
* Jump apex at 50%: `translateY(-36px)` with slight scale increase (`1.15`).
* Landing transition: Smooth settling using `cubic-bezier(0.2, 0.85, 0.4, 1.15)`.

### Ground Shadow Sync
* At rest on ground ($Y = 0\text{px}$): shadow is compact, sharp, and darker (`opacity: 0.35`, `scale: 1`).
* At jump apex ($Y = -36\text{px}$): shadow expands and softens (`opacity: 0.12`, `scale: 0.65`, `blur: 3px`).

### Accessibility (`prefers-reduced-motion`)
* When user has reduced motion preference enabled, complex 3D tumble rotations and bouncing are replaced with a fast fade and static face snap ($<50\text{ms}$).

---

## 5. Arena Animation Lifecycle, State Machine & Reconciliation

### State Machine

```text
[ idle ]
   │
   │ (Player taps 3D die / button OR server dice event arrives)
   ▼
[ rolling ]  ──────► (3D multi-axis tumble starts immediately + audio/haptic trigger)
   │
   │ (Authoritative value known + current tumble cycle completes)
   ▼
[ diceLanded ] ────► (Die snaps to exact face 1–6 + brief reading pause)
   │
   │ (Pawn step sequence)
   ▼
[ movingPawn ] ────► (Pawn steps tile-by-tile from 'from' to base roll landing tile)
   │
   │ (Check snake or ladder on landing tile)
   ├────────────────────────────────────────┐
   │ (Hit Snake or Ladder)                  │ (Normal Tile)
   ▼                                        │
[ resolvingSnakeLadder ]                    │
   │ - Show jump banner                     │
   │ - Play slide/climb audio               │
   │ - Glide pawn to final tail/top tile    │
   ▼                                        │
[ turnComplete ] ◄──────────────────────────┘
   │
   │ (Next player turn enabled)
   ▼
[ idle ]
```

### Interruption & Reconciliation
* If a network reconnect occurs or game state advances while an animation is in flight, the arena detects state mismatch and resets animation state cleanly back to `idle`, snapping pawns to authoritative `p1Position` and `p2Position`.
* A watchdog timer (`TOTAL_FALLBACK_TIMEOUT_MS`) guarantees that no animation gets permanently stuck.

---

## 6. Testing & Verification Plan

### Automated Tests
* **Unit Tests for `diceGeometry`**:
  * Verify values 1 through 6 produce exact CSS 3D rotation strings.
  * Verify spin count accumulator prevents backward rotation.
* **Component Render Tests**:
  * Verify `PipPattern` renders correct dot layouts and red ace for Face 1.
  * Verify `DiceFace` renders all 6 faces with proper 3D translation.
  * Verify `Dice3D` handles interactive tap-to-roll and disabled state.
* **Arena Integration Tests**:
  * Verify `SnakeLadderArena` executes discrete lifecycle states without mutating authoritative props.
  * Verify reconciliation snaps to authoritative state upon mismatch.

### Manual Verification
* Test local and multiplayer match flow in Telegram WebApp mockup.
* Verify 3D cube perspective and shadows across mobile and desktop viewports.
