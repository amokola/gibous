# 3D Animated Dice in Snakes & Ladders Design Specification

## Overview
This specification details the implementation of a 3D animated dice component and its animation lifecycle integration into the Snakes & Ladders game arena ([`SnakeLadderArena.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/game/SnakeLadderArena.tsx)).

The goal is to replace the static 2D roll display with an interactive, hardware-accelerated 3D cube matching the retro hand-drawn sketch aesthetic, while strictly keeping the server authoritative over all game state and dice outcomes.

---

## 1. Component Architecture & Decomposition

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

## 2. 3D Geometry & Rotation Mapping

For a cube of dimension $S = 56\text{px}$, the face distance from the center is $D = 28\text{px}$.

### Face Orientation Table

| Face | Coordinate Transform | Target Orientation | Pip Color |
| :--- | :--- | :--- | :--- |
| **1 (Front)** | `translateZ(28px)` | `rotateX(0deg) rotateY(0deg)` | Red (`#9b2c2c`) |
| **2 (Top)** | `rotateX(90deg) translateZ(28px)` | `rotateX(-90deg) rotateY(0deg)` | Black (`#1a1a1a`) |
| **3 (Right)** | `rotateY(90deg) translateZ(28px)` | `rotateX(0deg) rotateY(-90deg)` | Black (`#1a1a1a`) |
| **4 (Left)** | `rotateY(-90deg) translateZ(28px)` | `rotateX(0deg) rotateY(90deg)` | Black (`#1a1a1a`) |
| **5 (Bottom)** | `rotateX(-90deg) translateZ(28px)` | `rotateX(90deg) rotateY(0deg)` | Black (`#1a1a1a`) |
| **6 (Back)** | `rotateY(180deg) translateZ(28px)` | `rotateX(0deg) rotateY(180deg)` | Black (`#1a1a1a`) |

*Accumulated full rotations ($N \times 360^\circ$) are appended on every roll so that each throw produces a continuous forward tumble rather than an abrupt reverse spin.*

---

## 3. Physics & Animation Specifications

### 3D Tumble Keyframes (`diceRollTumble`)
* Multi-axis tumble: `rotateX(0deg) rotateY(0deg) rotateZ(0deg) translateY(0px)` to `rotateX(900deg) rotateY(1440deg) rotateZ(360deg) translateY(0px)`.
* Jump apex at 50%: `translateY(-36px)` with slight scale increase (`1.15`).
* Landing transition: Smooth settling using `cubic-bezier(0.2, 0.85, 0.4, 1.15)`.

### Ground Shadow Sync
* At rest on ground ($Y = 0\text{px}$): shadow is compact, sharp, and darker (`opacity: 0.35`, `scale: 1`).
* At jump apex ($Y = -36\text{px}$): shadow expands and softens (`opacity: 0.12`, `scale: 0.65`, `blur: 3px`).

### Accessibility (`prefers-reduced-motion`)
* When user has reduced motion preference enabled, complex 3D tumble rotations and bouncing are replaced with a fast fade and static face snap ($<50\text{ms}$).

---

## 4. Arena Animation Lifecycle & State Machine

In [`SnakeLadderArena.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/game/SnakeLadderArena.tsx), the gameplay sequence is governed by a clear visual state machine decoupled from authoritative server state.

### State Diagram

```text
[ idle ]
   │
   │ (Player taps 3D die / button OR server dice event arrives)
   ▼
[ rolling ]  ──────► (3D multi-axis tumble + audio/haptic trigger)
   │
   │ (Authoritative value received & tumble completes)
   ▼
[ diceLanded ] ────► (Die snaps to exact face 1–6 + brief 400ms reading pause)
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

### Multiplayer Synchronization Rules
1. **Authoritative Server Truth**: The client never invents a local random roll; it sends `sendSnakeRoll(roomCode)` and executes visual tumbling until the server's `lastDiceEvent` arrives.
2. **Synchronize State, Not Frames**: Both players receive the identical server event (`player`, `value`, `from`, `to`, `snakeOrLadder`) and execute the local animation sequence deterministically.
3. **Double-Roll Prevention**: Roll triggers (both the 3D cube tap and the action button) are disabled while `isRolling` or `isAnimating` is true.

---

## 5. Testing & Verification Plan

### Automated Tests
* **Unit Tests for `getRotationForValue`**:
  * Verify values 1 through 6 produce the exact expected mathematical 3D rotation strings.
  * Verify spin count accumulation logic prevents reverse rotations.
* **Component Render Tests**:
  * Verify `Dice3D` renders all 6 faces and correct pip counts.
  * Verify tap-to-roll triggers `onRoll` only when `canRoll` is true and not currently rolling.
* **Arena Integration Tests**:
  * Verify dice event triggers the complete sequence (`rolling` -> `diceLanded` -> `movingPawn` -> `resolvingSnakeLadder`).

### Manual Verification
* Test local and multiplayer match flow in Telegram WebApp mockup.
* Verify 3D cube perspective and shadows across mobile and desktop viewports.
* Verify sound effects and haptic feedback trigger at the appropriate moments.
