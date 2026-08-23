# Gibous Game UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gibous hub, duel shell, and three game arenas feel authored and game-specific while preserving all multiplayer state, rules, callbacks, and navigation.

**Architecture:** Add a small shared arena token layer in `src/index.css`, then apply it at the shell and arena boundaries. Keep `DuelShell` responsible for match chrome/overlays and each arena responsible for its own board/action composition. Prefer existing vector icons and semantic HTML over new dependencies or engine changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS utilities, lucide-react, Vitest, Testing Library, Vite, in-app Browser.

**Spec:** `docs/superpowers/specs/2026-08-23-game-ui-redesign-design.md`

## Global Constraints

- Preserve the warm paper foundation and tactile offset shadows.
- Keep Cabin Sketch for display/brand moments and Plus Jakarta Sans for utility text.
- Preserve multiplayer state contracts, rules, callbacks, navigation, and Telegram integration.
- Do not add a turn timer without server support.
- Do not add new external asset dependencies.
- Keep semantic buttons, visible focus styles, disabled semantics, reduced-motion behavior, and mobile reachability.

---

### Task 1: Add shared arena visual tokens and motion primitives

**Files:**
- Modify: `src/index.css`
- Test: `tests/component/arenas/SnakeLadderArena.test.tsx`, `tests/component/arenas/Connect4Arena.test.tsx`, `tests/component/arenas/RPSArena.test.tsx` (class/state assertions added in later tasks)

**Interfaces:**
- Produces CSS custom properties and utility classes used by `DuelShell`, the three arena components, `RPSCard`, and `GameCard`.

- [ ] **Step 1: Inspect the current global CSS utilities and preserve existing selectors**

Read the existing `@layer base`, paper backgrounds, shadows, button press classes, animation definitions, and reduced-motion block. Do not rename selectors used by unmodified components.

- [ ] **Step 2: Add the shared and game-specific token variables**

Add variables under `:root`:

```css
--arena-paper: #f7f3eb;
--arena-ink: #171717;
--arena-gram: #229ed9;
--arena-snake-moss: #2f6b4f;
--arena-snake-clay: #c84b3f;
--arena-snake-gold: #e4af32;
--arena-connect-blue: #1f3358;
--arena-connect-coral: #e45345;
--arena-connect-cyan: #55c3d5;
--arena-rps-plum: #432b45;
--arena-rps-cream: #f8e9c8;
--arena-rps-vermilion: #d8664f;
--arena-motion-fast: 150ms;
--arena-motion-standard: 220ms;
--arena-motion-emphasis: 420ms;
```

- [ ] **Step 3: Add reusable visual primitives**

Add small classes for arena stage surfaces, active player state, control decks, focus-visible ink outlines, and `prefers-reduced-motion: reduce` overrides. Keep classes flat and composable so Tailwind markup does not gain repeated long shadow/border strings.

- [ ] **Step 4: Run the existing client typecheck**

Run: `npm run typecheck:client`

Expected: exit code `0`; CSS-only changes do not introduce TypeScript errors.

- [ ] **Step 5: Commit the shared token layer**

```powershell
git add -- src/index.css
git commit -m "style: add arena visual tokens"
```

### Task 2: Recompose the shared duel shell

**Files:**
- Modify: `src/components/duel/DuelShell.tsx`
- Test: `tests/component/duel/DuelShell.test.tsx`

**Interfaces:**
- Consumes: existing `NormalizedDuelState`, `onLeave`, `onSendEmote`, disconnect props, and child arena content.
- Produces: the same props/callback behavior with a clearer match rail, status rail, arena stage, and reaction deck.

- [ ] **Step 1: Add failing semantic assertions for the redesigned shell**

Extend `tests/component/duel/DuelShell.test.tsx` so the existing fixture asserts:

```tsx
expect(screen.getByText('MATCH POT')).toBeInTheDocument();
expect(screen.getByText('YOU')).toBeInTheDocument();
expect(screen.getByText('OPPONENT')).toBeInTheDocument();
expect(screen.getByTestId('duel-arena-stage')).toBeInTheDocument();
```

Keep the current emote, surrender, and disconnect assertions because those behaviors must not regress.

- [ ] **Step 2: Run the focused shell test and confirm the new assertions fail**

Run: `npx vitest run tests/component/duel/DuelShell.test.tsx`

Expected: FAIL only on the new labels/test id before implementation.

- [ ] **Step 3: Implement the match rail and status rail**

In `DuelShell.tsx`:

- keep the existing back/resign button and title;
- render player cards with explicit `YOU`/`OPPONENT` labels based on `myRole`;
- label the pot button `MATCH POT` while preserving the numeric pot and `PotBreakdownModal` behavior;
- keep the existing game-specific subtext (`Tile`, RPS score, or disc color) but reduce visual noise;
- use a single status rail for turn/disconnect/simultaneous-choice state;
- wrap `children` in `data-testid="duel-arena-stage"` and apply shared arena stage classes;
- keep floating emotes, reconnected toast, disconnect overlay, pot modal, and resign modal functionally intact.

- [ ] **Step 4: Re-run the focused shell test**

Run: `npx vitest run tests/component/duel/DuelShell.test.tsx`

Expected: all shell tests PASS.

- [ ] **Step 5: Commit the shell redesign**

```powershell
git add -- src/components/duel/DuelShell.tsx tests/component/duel/DuelShell.test.tsx
git commit -m "style: recompose duel shell"
```

### Task 3: Give Snakes & Ladders a field-map arena treatment

**Files:**
- Modify: `src/components/game/SnakeLadderArena.tsx`
- Test: `tests/component/arenas/SnakeLadderArena.test.tsx`

**Interfaces:**
- Consumes: existing `duelState`, `onRoll`, `lastDiceEvent`, `CANONICAL_SNAKES`, and `CANONICAL_LADDERS` behavior.
- Produces: the same roll interaction and authoritative animation, with a game-specific stage and clearer action hierarchy.

- [ ] **Step 1: Add failing assertions for arena identity and action hierarchy**

Extend the test to assert:

```tsx
expect(screen.getByTestId('snake-arena')).toBeInTheDocument();
expect(screen.getByText('FIELD MAP')).toBeInTheDocument();
expect(screen.getByText('START')).toBeInTheDocument();
expect(screen.getByText('FINISH')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /ROLL DICE/i })).toHaveAttribute('data-game-action', 'roll');
```

Keep the active-turn click assertion and disabled waiting assertion.

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `npx vitest run tests/component/arenas/SnakeLadderArena.test.tsx`

Expected: FAIL only on the new labels/test id/attribute before implementation.

- [ ] **Step 3: Implement the field-map composition**

In `SnakeLadderArena.tsx`:

- wrap the arena in `data-testid="snake-arena"` with the moss/clay stage classes;
- add a small `FIELD MAP` stamp and `START`/`FINISH` labels without changing board coordinates;
- retain the 10x10 board generation but replace emoji-only markers with compact styled markers using text labels or existing vector-friendly CSS treatment;
- add a stronger active pawn ring/spotlight and keep both pawn positions from state;
- keep the jump banner text and event timing but use the moss/gold/clay state classes;
- preserve the last-roll value and use `data-game-action="roll"` on the primary button;
- keep `onRoll` invocation and disabled logic exactly as-is.

- [ ] **Step 4: Re-run the focused arena test**

Run: `npx vitest run tests/component/arenas/SnakeLadderArena.test.tsx`

Expected: all Snake & Ladders tests PASS.

- [ ] **Step 5: Commit the Snake arena redesign**

```powershell
git add -- src/components/game/SnakeLadderArena.tsx tests/component/arenas/SnakeLadderArena.test.tsx
git commit -m "style: art direct snakes and ladders arena"
```

### Task 4: Give Connect 4 a blueprint chassis and explicit drop affordance

**Files:**
- Modify: `src/components/connect4/Connect4Arena.tsx`
- Test: `tests/component/arenas/Connect4Arena.test.tsx`

**Interfaces:**
- Consumes: existing board state, `winningCells`, active-turn logic, and `onDropDisc` callback.
- Produces: the same 7-column interaction with stronger game-specific presentation and ghost landing feedback.

- [ ] **Step 1: Add failing assertions for the blueprint arena**

Extend the test to assert:

```tsx
expect(screen.getByTestId('connect4-arena')).toBeInTheDocument();
expect(screen.getByText('BLUEPRINT TABLE')).toBeInTheDocument();
expect(screen.getByText('DROP LANE')).toBeInTheDocument();
expect(screen.getByTitle('Drop in column 3')).toHaveAttribute('data-column', '2');
```

Keep the existing active-turn callback and disabled-turn assertions.

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `npx vitest run tests/component/arenas/Connect4Arena.test.tsx`

Expected: FAIL only on the new identity labels/test id/attribute before implementation.

- [ ] **Step 3: Implement the blueprint composition**

In `Connect4Arena.tsx`:

- wrap the arena in `data-testid="connect4-arena"` and use the blueprint stage token;
- add a `BLUEPRINT TABLE` stamp and `DROP LANE` helper label;
- preserve the 7 top buttons and `title` attributes, adding `data-column` with the zero-based index;
- render the current player’s ghost disc in the actual lowest empty slot when a lane is hovered/focused;
- make full columns visibly unavailable without changing the callback guard;
- add a stronger winning-cell ring/highlight while keeping `winningCells` as the source of truth;
- preserve board cell click support and the existing waiting helper text.

- [ ] **Step 4: Re-run the focused arena test**

Run: `npx vitest run tests/component/arenas/Connect4Arena.test.tsx`

Expected: all Connect 4 tests PASS.

- [ ] **Step 5: Commit the Connect 4 redesign**

```powershell
git add -- src/components/connect4/Connect4Arena.tsx tests/component/arenas/Connect4Arena.test.tsx
git commit -m "style: art direct connect four arena"
```

### Task 5: Stage Rock Paper Scissors as a showdown table

**Files:**
- Modify: `src/components/rps/RPSArena.tsx`
- Modify: `src/components/rps/RPSCard.tsx`
- Test: `tests/component/arenas/RPSArena.test.tsx`

**Interfaces:**
- Consumes: existing `RPSChoice`, `RPS_CHOICES`, `lastRPSEvent`, score state, and `onChooseRPS` callback.
- Produces: the same choice-lock, countdown, reveal, and round state with clearer visual staging.

- [ ] **Step 1: Add failing assertions for the showdown UI**

Extend `RPSArena.test.tsx` to assert:

```tsx
expect(screen.getByTestId('rps-arena')).toBeInTheDocument();
expect(screen.getByText('SHOWDOWN TABLE')).toBeInTheDocument();
expect(screen.getByText('BEST OF 3')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /ROCK/i })).toHaveAttribute('data-choice', 'rock');
```

Keep the existing choice callback and locked-choice state assertion.

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `npx vitest run tests/component/arenas/RPSArena.test.tsx`

Expected: FAIL only on the new identity labels/test id/attribute before implementation.

- [ ] **Step 3: Implement the showdown stage and choice-card states**

In `RPSArena.tsx`:

- add `data-testid="rps-arena"` and a plum stage wrapper;
- replace the repeated all-caps score block with a compact `BEST OF 3` score rail while keeping score values and round number visible;
- keep the existing countdown/reveal/locked-choice state machine and timeouts;
- use the shared motion/state classes for countdown and round-result emphasis;
- keep the opponent name and draw/win/loss copy accessible as text.

In `RPSCard.tsx`:

- add `data-choice={choice}` to each button;
- use the existing `RockIcon`, `PaperIcon`, and `ScissorsIcon` with larger game-specific treatment;
- make selected, hover, focus, and disabled states visibly distinct without relying on color alone;
- preserve the `onSelect(choice)` callback.

- [ ] **Step 4: Re-run the focused arena test**

Run: `npx vitest run tests/component/arenas/RPSArena.test.tsx`

Expected: all RPS tests PASS.

- [ ] **Step 5: Commit the RPS redesign**

```powershell
git add -- src/components/rps/RPSArena.tsx src/components/rps/RPSCard.tsx tests/component/arenas/RPSArena.test.tsx
git commit -m "style: art direct rock paper scissors arena"
```

### Task 6: Make hub game cards preview their arena identities

**Files:**
- Modify: `src/components/home/GameCard.tsx`
- Test: create `tests/component/home/GameCard.test.tsx`

**Interfaces:**
- Consumes: existing `GameCardProps` and `onPlay(game)` callback.
- Produces: the same clickable card and accessible play button with game-specific accent treatment derived from the existing `bgClass`, `badgeColor`, and icon props.

- [ ] **Step 1: Write the focused card test**

Create a jsdom test with a simple icon and assert:

```tsx
render(<GameCard game="snake" title="Snakes & Ladders" subtitle="Classic race to tile 100" badge="Classic" badgeColor="bg-green-100" minStake={50} icon={<span>snake</span>} bgClass="bg-white" onPlay={onPlay} />);
expect(screen.getByRole('button', { name: /Play Snakes & Ladders/i })).toBeInTheDocument();
expect(screen.getByText(/ARENA PREVIEW/i)).toBeInTheDocument();
```

Also click the play button and assert `onPlay` receives `snake`.

- [ ] **Step 2: Run the new test and confirm the preview assertion fails**

Run: `npx vitest run tests/component/home/GameCard.test.tsx`

Expected: FAIL on the missing `ARENA PREVIEW` text before implementation.

- [ ] **Step 3: Implement the card composition**

In `GameCard.tsx`:

- keep the card and play button click behavior;
- add a small `ARENA PREVIEW` label and an accent rail/visual treatment that uses the provided `bgClass`/`badgeColor` inputs;
- ensure the card title remains the dominant text and the play button keeps its accessible name;
- maintain responsive flex behavior in the 420px app viewport.

- [ ] **Step 4: Run the focused card test**

Run: `npx vitest run tests/component/home/GameCard.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the game-card redesign**

```powershell
git add -- src/components/home/GameCard.tsx tests/component/home/GameCard.test.tsx
git commit -m "style: add arena identity to game cards"
```

### Task 7: Run the complete verification loop

**Files:**
- Modify: any implementation file required by the verification findings; do not commit screenshots, traces, or reports into the repository.

**Interfaces:**
- Verifies the complete behavior from the approved spec without changing its scope.

- [ ] **Step 1: Run focused component tests**

Run:

```powershell
npx vitest run tests/component/duel/DuelShell.test.tsx tests/component/arenas/SnakeLadderArena.test.tsx tests/component/arenas/Connect4Arena.test.tsx tests/component/arenas/RPSArena.test.tsx tests/component/home/GameCard.test.tsx
```

Expected: exit code `0`, all selected tests pass.

- [ ] **Step 2: Run client and server typechecks**

Run:

```powershell
npm run typecheck:client
npm run typecheck:server
```

Expected: both commands exit `0` with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code `0` and Vite emits the production bundle.

- [ ] **Step 4: Validate the local app in the in-app Browser**

Use the existing Vite server at `http://127.0.0.1:5173/` if available; otherwise start `npm run dev -- --host 127.0.0.1` and use the printed URL. Verify the flow:

`home → Play Snakes & Ladders → lobby → select stake → open stake confirmation → close modal`

Capture desktop and mobile-sized screenshots. Confirm the new card accents, lobby hierarchy, focus/disabled states, and absence of framework overlays or console errors. Arena components are additionally verified by the focused jsdom tests because the local account has zero balance and cannot enter a funded match.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`

Expected: exit code `0`; report any pre-existing unrelated failures explicitly instead of masking them.

- [ ] **Step 6: Review the diff and commit the verified implementation**

Run: `git status --short` and `git diff --stat`.

Confirm only the approved UI files/tests are changed, then:

```powershell
git add -- src/index.css src/components/duel/DuelShell.tsx src/components/game/SnakeLadderArena.tsx src/components/connect4/Connect4Arena.tsx src/components/rps/RPSArena.tsx src/components/rps/RPSCard.tsx src/components/home/GameCard.tsx tests/component/duel/DuelShell.test.tsx tests/component/arenas/SnakeLadderArena.test.tsx tests/component/arenas/Connect4Arena.test.tsx tests/component/arenas/RPSArena.test.tsx tests/component/home/GameCard.test.tsx
git commit -m "feat: elevate game arena interfaces"
```

## Self-review checklist

- Spec coverage: shared shell, three arena identities, hub/lobby cards, accessibility, responsive behavior, no engine changes, and browser verification are all mapped to Tasks 1–7.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: new `data-testid`, `data-game-action`, `data-column`, and `data-choice` attributes are only test hooks; all existing prop and callback types remain unchanged.
- Risk boundary: no new timer, network call, asset dependency, or game-rule behavior is introduced.
