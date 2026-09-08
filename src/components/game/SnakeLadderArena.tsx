import React, { useState, useEffect, useRef } from 'react';
import { NormalizedDuelState } from '../../types/game';
import {
  CANONICAL_SNAKES,
  CANONICAL_LADDERS,
} from '../../../shared/constants/board';
import {
  calculateStepSequence,
  getLadderLinePoint,
  getSnakeCurvePoint,
} from '../../config/boardConfig';
import { BoardGrid } from './BoardGrid';
import { Dice3D } from './Dice3D';
import { DICE_TIMING } from './dice/constants';
import { Dices } from 'lucide-react';

interface SnakeLadderArenaProps {
  duelState: NormalizedDuelState;
  onRoll: () => void;
}

type AnimationState =
  | 'idle'
  | 'rolling'
  | 'diceLanded'
  | 'movingPawn'
  | 'landing'
  | 'resolvingFeature'
  | 'turnComplete';

export const SnakeLadderArena: React.FC<SnakeLadderArenaProps> = ({
  duelState,
  onRoll,
}) => {
  const { myRole, activePlayer, gameState, lastDiceEvent } = duelState;
  const isMyTurn = myRole !== null && activePlayer === myRole;

  const [p1Pos, setP1Pos] = useState(gameState?.p1Position || 1);
  const [p2Pos, setP2Pos] = useState(gameState?.p2Position || 1);
  const [p1Hopping, setP1Hopping] = useState(false);
  const [p2Hopping, setP2Hopping] = useState(false);
  const [p1CustomPos, setP1CustomPos] = useState<{ x: number; y: number } | null>(null);
  const [p2CustomPos, setP2CustomPos] = useState<{ x: number; y: number } | null>(null);

  const [activeSnakeId, setActiveSnakeId] = useState<string | null>(null);
  const [activeLadderId, setActiveLadderId] = useState<string | null>(null);
  const [highlightedTile, setHighlightedTile] = useState<number | null>(null);

  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [jumpBanner, setJumpBanner] = useState<{
    text: string;
    type: 'ladder' | 'snake' | 'bounce';
  } | null>(null);
  const [displayRoll, setDisplayRoll] = useState<number | null>(
    gameState?.lastRoll || null
  );
  const [isLocalRolling, setIsLocalRolling] = useState(false);

  const processedEventRef = useRef<string | null>(null);
  const animatingEventKeyRef = useRef<string | null>(null);
  const rollingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRolling = animState === 'rolling' || isLocalRolling;
  const isAnimating = animState !== 'idle';
  const isGameOver =
    Boolean(duelState.winner) ||
    duelState.room?.status === 'gameover' ||
    p1Pos === 100 ||
    p2Pos === 100;

  const handleRollClick = () => {
    if (isMyTurn && !isAnimating && !isLocalRolling && !isGameOver) {
      setIsLocalRolling(true);
      setAnimState('rolling');
      onRoll();

      if (rollingWatchdogRef.current) {
        clearTimeout(rollingWatchdogRef.current);
      }
      rollingWatchdogRef.current = setTimeout(() => {
        setIsLocalRolling(false);
        setAnimState('idle');
      }, 6000);
    }
  };

  // Helper sleep function
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Smooth gliding helper for ladders and snakes
  const animateGlide = (
    evaluator: (t: number) => { x: number; y: number },
    durationMs: number,
    setCoord: (pos: { x: number; y: number } | null) => void,
    isMounted: () => boolean
  ): Promise<void> => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = 20; // 50fps smooth steps
      const timer = setInterval(() => {
        if (!isMounted()) {
          clearInterval(timer);
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // easeInOutCubic curve
        const eased =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        const currentPoint = evaluator(eased);
        setCoord(currentPoint);

        if (progress >= 1) {
          clearInterval(timer);
          resolve();
        }
      }, interval);
    });
  };

  // Deterministic animation sequencer on authoritative server dice event
  useEffect(() => {
    if (!lastDiceEvent) return;
    const eventKey = `${lastDiceEvent.player}-${lastDiceEvent.value}-${lastDiceEvent.to}-${lastDiceEvent.version}`;
    if (processedEventRef.current === eventKey) return;
    processedEventRef.current = eventKey;
    animatingEventKeyRef.current = eventKey;

    if (rollingWatchdogRef.current) {
      clearTimeout(rollingWatchdogRef.current);
      rollingWatchdogRef.current = null;
    }

    let isMounted = true;
    const checkMounted = () => isMounted;

    const animateEvent = async () => {
      setIsLocalRolling(false);
      setAnimState('rolling');
      setDisplayRoll(lastDiceEvent.value);

      // Ensure start position matches the movement origin
      if (lastDiceEvent.player === 'p1') {
        setP1Pos(lastDiceEvent.from);
      } else {
        setP2Pos(lastDiceEvent.from);
      }

      // Phase 1: 3D Dice tumble
      await sleep(DICE_TIMING.TUMBLE_MS);
      if (!isMounted) return;

      // Phase 2: Dice landed reveal
      setAnimState('diceLanded');
      await sleep(DICE_TIMING.LANDING_MS);
      if (!isMounted) return;

      // Phase 3: Step-by-step countable pawn traversal
      setAnimState('movingPawn');
      const player = lastDiceEvent.player;
      const startTile = lastDiceEvent.from;
      const rollValue = lastDiceEvent.value;

      const stepSequence = calculateStepSequence(startTile, rollValue);

      for (const nextTile of stepSequence) {
        if (!isMounted) return;

        if (player === 'p1') {
          setP1Pos(nextTile);
          setP1Hopping(true);
        } else {
          setP2Pos(nextTile);
          setP2Hopping(true);
        }

        await sleep(100);
        if (!isMounted) return;

        if (player === 'p1') {
          setP1Hopping(false);
        } else {
          setP2Hopping(false);
        }

        await sleep(120);
      }

      if (!isMounted) return;

      // Phase 4: Landing bounce on base target
      setAnimState('landing');
      const baseTarget = lastDiceEvent.snakeOrLadder
        ? lastDiceEvent.snakeOrLadder.from
        : lastDiceEvent.to;

      const isBounceBack = stepSequence.includes(100) && baseTarget < 100;
      if (isBounceBack) {
        setJumpBanner({
          text: `${player.toUpperCase()} OVERSHOT TILE 100! BOUNCED BACK TO ${baseTarget}`,
          type: 'bounce',
        });
      }

      setHighlightedTile(baseTarget);
      await sleep(DICE_TIMING.READ_PAUSE_MS);
      setHighlightedTile(null);
      if (isBounceBack && !lastDiceEvent.snakeOrLadder) {
        setJumpBanner(null);
      }
      if (!isMounted) return;

      // Phase 5: Resolve Ladder or Snake if triggered
      if (lastDiceEvent.snakeOrLadder) {
        setAnimState('resolvingFeature');
        const isLadder = lastDiceEvent.snakeOrLadder.type === 'ladder';
        const { from: featureFrom, to: featureTo } = lastDiceEvent.snakeOrLadder;

        if (isLadder) {
          const ladderObj = CANONICAL_LADDERS.find(
            (l) => l.bottom === featureFrom && l.top === featureTo
          ) || { id: `ladder-${featureFrom}-${featureTo}`, bottom: featureFrom, top: featureTo };

          setActiveLadderId(ladderObj.id);
          setJumpBanner({
            text: `${player.toUpperCase()} CLIMBING LADDER (${featureFrom} ➔ ${featureTo})`,
            type: 'ladder',
          });

          await animateGlide(
            (t) => getLadderLinePoint(ladderObj, t),
            650,
            player === 'p1' ? setP1CustomPos : setP2CustomPos,
            checkMounted
          );

          if (!isMounted) return;
          if (player === 'p1') {
            setP1Pos(featureTo);
            setP1CustomPos(null);
          } else {
            setP2Pos(featureTo);
            setP2CustomPos(null);
          }

          await sleep(250);
          setActiveLadderId(null);
          setJumpBanner(null);
        } else {
          const snakeObj = CANONICAL_SNAKES.find(
            (s) => s.head === featureFrom && s.tail === featureTo
          ) || {
            id: `snake-${featureFrom}-${featureTo}`,
            head: featureFrom,
            tail: featureTo,
            color: 'red' as const,
          };

          setActiveSnakeId(snakeObj.id);
          setJumpBanner({
            text: `${player.toUpperCase()} SLIDING DOWN SNAKE (${featureFrom} ➔ ${featureTo})`,
            type: 'snake',
          });

          await animateGlide(
            (t) => getSnakeCurvePoint(snakeObj, t),
            750,
            player === 'p1' ? setP1CustomPos : setP2CustomPos,
            checkMounted
          );

          if (!isMounted) return;
          if (player === 'p1') {
            setP1Pos(featureTo);
            setP1CustomPos(null);
          } else {
            setP2Pos(featureTo);
            setP2CustomPos(null);
          }

          await sleep(250);
          setActiveSnakeId(null);
          setJumpBanner(null);
        }
      }

      // Phase 6: Turn completion
      setAnimState('turnComplete');
      await sleep(150);
      if (!isMounted) return;
      animatingEventKeyRef.current = null;
      setAnimState('idle');
    };

    animateEvent();

    return () => {
      isMounted = false;
      animatingEventKeyRef.current = null;
      if (rollingWatchdogRef.current) {
        clearTimeout(rollingWatchdogRef.current);
        rollingWatchdogRef.current = null;
      }
      setP1CustomPos(null);
      setP2CustomPos(null);
      setP1Hopping(false);
      setP2Hopping(false);
      setActiveSnakeId(null);
      setActiveLadderId(null);
      setHighlightedTile(null);
    };
  }, [lastDiceEvent]);

  // Reconciliation: Sync positions only when completely idle and no animation is running
  useEffect(() => {
    const currentEventKey = lastDiceEvent
      ? `${lastDiceEvent.player}-${lastDiceEvent.value}-${lastDiceEvent.to}-${lastDiceEvent.version}`
      : null;
    const isEventPending = currentEventKey !== null && currentEventKey !== processedEventRef.current;

    if (animState === 'idle' && !isLocalRolling && !animatingEventKeyRef.current && !isEventPending) {
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
  }, [
    gameState?.p1Position,
    gameState?.p2Position,
    gameState?.lastRoll,
    lastDiceEvent,
    animState,
    isLocalRolling,
    p1Pos,
    p2Pos,
    displayRoll,
  ]);

  const isP1Won = p1Pos === 100 || duelState.winner === 'p1';
  const isP2Won = p2Pos === 100 || duelState.winner === 'p2';
  const isWinner = (isP1Won && myRole === 'p1') || (isP2Won && myRole === 'p2');

  return (
    <div className="flex flex-col items-center justify-between w-full h-full max-w-sm mx-auto py-1 font-body select-none">
      {/* Jump Banner Alert or Game Over Alert */}
      {jumpBanner ? (
        <div
          className={`w-full py-1.5 px-3 rounded-none font-sketch font-bold text-center text-sm border-2 border-black sketch-shadow animate-bounce mb-1 ${
            jumpBanner.type === 'ladder'
              ? 'bg-[#dcfce7] text-[#166534]'
              : jumpBanner.type === 'bounce'
              ? 'bg-[#fff9c4] text-[#854d0e]'
              : 'bg-[#fee2e2] text-[#991b1b]'
          }`}
        >
          {jumpBanner.text}
        </div>
      ) : (p1Pos === 100 || p2Pos === 100 || isGameOver) && (
        <div
          className={`w-full py-1.5 px-3 rounded-none font-sketch font-bold text-center text-sm border-2 border-black sketch-shadow animate-bounce mb-1 ${
            isWinner
              ? 'bg-[#dcfce7] text-[#166534]'
              : duelState.winner === 'draw'
              ? 'bg-[#e0f2fe] text-[#0369a1]'
              : 'bg-[#fee2e2] text-[#991b1b]'
          }`}
        >
          {p1Pos === 100
            ? `${myRole === 'p1' ? 'YOU' : 'PLAYER 1'} REACHED TILE 100! 👑`
            : p2Pos === 100
            ? `${myRole === 'p2' ? 'YOU' : 'PLAYER 2'} REACHED TILE 100! 👑`
            : isWinner
            ? 'MATCH WON'
            : 'MATCH FINISHED'}
        </div>
      )}

      {/* Persistent 10x10 Board Grid (Zero Emojis Inside Cells) */}
      <div className="w-full flex items-center justify-center my-0.5">
        <BoardGrid
          p1Position={p1Pos}
          p2Position={p2Pos}
          activePlayer={activePlayer || 'p1'}
          p1Hopping={p1Hopping}
          p2Hopping={p2Hopping}
          p1CustomPos={p1CustomPos}
          p2CustomPos={p2CustomPos}
          activeSnakeId={activeSnakeId}
          activeLadderId={activeLadderId}
          highlightedTile={highlightedTile}
        />
      </div>

      {/* Center 3D Dice Stage & Interaction */}
      <div className="w-full flex flex-col items-center justify-center mt-1">
        <Dice3D
          value={displayRoll}
          isRolling={isRolling}
          activePlayer={activePlayer || 'p1'}
          canRoll={isMyTurn && !isAnimating && !isGameOver}
          statusText={
            isGameOver
              ? 'Match Finished'
              : isMyTurn
              ? 'Your Turn'
              : "Opponent's Turn"
          }
          onRoll={handleRollClick}
        />
      </div>

      {/* Primary Roll Action Button */}
      <div className="w-full mt-1.5 px-1">
        <button
          onClick={handleRollClick}
          disabled={!isMyTurn || isAnimating || isGameOver}
          className={`w-full py-2.5 px-4 rounded-none font-sketch font-bold text-base tracking-wider uppercase border-2 border-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
            isMyTurn && !isAnimating && !isGameOver
              ? 'bg-[#9b2c2c] hover:bg-[#b91c1c] text-white sketch-shadow sketch-btn-press'
              : 'bg-neutral-200 text-neutral-500 cursor-not-allowed opacity-70'
          }`}
        >
          <Dices className="w-5 h-5 stroke-[2.5]" />
          <span>
            {isGameOver
              ? p1Pos === 100 || p2Pos === 100
                ? 'TILE 100 REACHED — MATCH OVER'
                : 'MATCH COMPLETED'
              : isRolling
              ? 'ROLLING...'
              : isMyTurn
              ? 'ROLL DICE'
              : 'WAITING FOR OPPONENT'}
          </span>
        </button>
      </div>
    </div>
  );
};
