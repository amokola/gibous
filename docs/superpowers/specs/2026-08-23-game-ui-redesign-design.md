# Gibous Game UI Redesign

**Date:** 2026-08-23  
**Topic:** Distinctive, game-specific presentation for the Gibous duel arenas  
**Status:** Approved direction; implementation pending

## 1. Goal

Make the game interfaces feel intentionally designed and worth showing while preserving the current Gibous sketchbook/neo-brutalist identity and all multiplayer behavior.

The redesign should make a player feel that they entered a specific arena, not a generic screen with a different board dropped into it. The three games need different visual rhythms, color signatures, and action emphasis while still belonging to one product.

## 2. Findings from the current UI

- The same paper background, black borders, hard offset shadows, and all-caps labels are repeated across hub, lobby, and match surfaces.
- `DuelShell` is visually dense: player cards, pot, turn banner, reaction bar, and the arena compete for attention.
- `SnakeLadderArena` uses a flat grid and emoji markers, so the board reads more like a form than a game board.
- `Connect4Arena` has the right interaction primitives, but the board, drop controls, and status copy do not create a strong sense of turn ownership.
- `RPSArena` has the correct best-of-three flow, but the weapon choices and clash state do not have enough visual contrast or staging.
- The lobby game selector communicates options but not enough personality or anticipation.

## 3. Design direction

### 3.1 Shared system

Keep:

- the warm paper foundation and tactile offset shadows;
- Cabin Sketch for display/brand moments and Plus Jakarta Sans for utility text;
- black ink as the structural color;
- existing icon/component conventions and multiplayer state contracts.

Refine:

- replace repeated rectangular framing with a small set of purposeful surfaces: match rail, arena stage, action dock, and control deck;
- use a restrained palette with one signature accent per game;
- reduce decorative labels and use hierarchy, spacing, and color to communicate state;
- use consistent motion durations for press, active turn, reveal, and victory states;
- keep focus rings, disabled states, and reduced-motion behavior explicit.

### 3.2 Game palettes

| Surface | Primary | Secondary | State accent |
| --- | --- | --- | --- |
| Shared shell | paper `#f7f3eb` | ink `#171717` | gram blue `#229ed9` |
| Snakes & Ladders | moss `#2f6b4f` | clay `#c84b3f` | marigold `#e4af32` |
| Connect 4 | blueprint `#1f3358` | coral `#e45345` | cyan `#55c3d5` |
| Rock Paper Scissors | plum `#432b45` | cream `#f8e9c8` | vermilion `#d8664f` |

Exact colors may be tuned against browser screenshots, but each arena must remain visibly distinct without introducing neon gradients or unrelated branding.

## 4. Screen design

### 4.1 Shared duel shell

Update `src/components/duel/DuelShell.tsx` to provide:

- a compact top match rail with a clear left/right player relationship, centered pot display, and a single exit control;
- player cards that distinguish `YOU` from `OPPONENT` using position, accent line, and active-turn indicator rather than extra text blocks;
- a single status rail below the match rail with the active player, waiting state, or disconnect countdown;
- a lower control deck for reactions, visually subordinate to the arena action;
- better modal surface styling while retaining existing resign and pot-breakdown behavior.

The component remains responsible for shell-level overlays and callbacks. Arena components remain responsible for game-specific controls and state.

### 4.2 Snakes & Ladders

Update `src/components/game/SnakeLadderArena.tsx` and its visible supporting UI so that:

- the board has a field-map frame with a moss/clay signature and clear start/finish treatment;
- the player pawns are visually dominant and the active pawn has a readable spotlight/outline;
- snake and ladder markers are made more deliberate through existing vector/CSS treatment instead of relying on repeated emoji glyphs;
- the dice result and roll action become a composed action dock with a strong primary CTA and a smaller “last roll” readout;
- jump banners read as event moments and use the game palette for ladder versus snake outcomes;
- disabled/waiting states remain legible and do not look like broken controls.

The authoritative server event animation and the `onRoll` callback stay unchanged.

### 4.3 Connect 4

Update `src/components/connect4/Connect4Arena.tsx` to:

- use the blueprint palette for the board stage and reserved coral/cyan colors for players;
- make each drop lane feel clickable, with a strong ghost-disc preview at the actual landing cell;
- separate the board from the helper copy and make turn ownership visible before the user scans the header;
- improve winning-cell emphasis with a deliberate highlight treatment rather than only bouncing discs;
- preserve click/touch support on both the lane controls and board cells.

No new timer or rule behavior is introduced in this pass because the current arena contract does not expose an authoritative turn deadline.

### 4.4 Rock Paper Scissors

Update `src/components/rps/RPSArena.tsx` and `src/components/rps/RPSCard.tsx` to:

- create a plum showdown stage with a clearly separated best-of-three score rail;
- present the three vector weapon icons as distinct, tactile choice cards with stronger selected/locked states;
- make “waiting for opponent” feel like a deliberate tension state rather than a disabled form;
- make the 3-2-1 countdown, reveal, draw, and round-win states share one visual choreography;
- keep the existing choice-lock and authoritative event timing unchanged.

### 4.5 Hub and lobby game selection

Update `src/components/home/GameCard.tsx` and, if needed, the existing selector styles in the lobby so each game gets:

- a distinct accent stripe and icon treatment;
- a more intentional title/description/stakes hierarchy;
- a clear play affordance that does not compete with the game title;
- a consistent responsive layout in the 420px mobile viewport and desktop device mockup.

## 5. Implementation boundaries

Primary files:

- `src/index.css`
- `src/components/duel/DuelShell.tsx`
- `src/components/game/SnakeLadderArena.tsx`
- `src/components/connect4/Connect4Arena.tsx`
- `src/components/rps/RPSArena.tsx`
- `src/components/rps/RPSCard.tsx`
- `src/components/home/GameCard.tsx`
- `src/components/icons/GameIcons.tsx` only where an existing icon needs a visual variant

The following are explicitly out of scope:

- game rules, server engines, matchmaking, stake calculations, or wallet/transaction behavior;
- navigation architecture or Telegram integration;
- adding a turn timer without server support;
- replacing the existing product identity with a dark/neon arcade theme;
- adding new external asset dependencies.

## 6. Interaction and accessibility requirements

- Keep semantic buttons and visible focus styles on all action controls.
- Preserve disabled semantics for unavailable moves.
- Make color changes redundant with text, position, or icon shape.
- Preserve `prefers-reduced-motion` behavior and avoid animation-only state communication.
- Ensure the primary game action remains reachable without horizontal scrolling at mobile sizes.
- Verify the main flow: hub → game selection → lobby → stake modal; arena components are covered through component tests and rendered smoke checks because a zero-balance local session cannot enter a funded match.

## 7. Verification plan

- Run the client and server typechecks.
- Run component tests for the modified arenas and game cards.
- Run a production build.
- Use the in-app Browser against the local Vite server to inspect hub, lobby, and responsive layouts.
- Exercise visible controls for game selection, stake selection, modal open/close, and available arena actions through component/test fixtures.
- Check desktop and mobile-sized screenshots for clipping, unreadable text, accidental wrapping, and broken state hierarchy.

## 8. Intentional deviation

This redesign uses the repository’s existing vector icon and code-native visual system rather than adding generated raster sprites or new external asset pipelines. That keeps the scope focused on UI composition, preserves crisp rendering in the Telegram-sized viewport, and avoids introducing asset-loading risk into the multiplayer surface.
