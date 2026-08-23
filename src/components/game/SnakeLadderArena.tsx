import React, { useState, useEffect, useRef } from 'react';
import { NormalizedDuelState } from '../../hooks/useMultiplayer';
import { CANONICAL_SNAKES, CANONICAL_LADDERS } from '../../../shared/constants/board';
import { Dice3D } from './Dice3D';
import { DICE_TIMING } from './dice/constants';

interface SnakeLadderArenaProps {
  duelState: NormalizedDuelState;
  onRoll: () => void;
}

type AnimationState =
  | 'idle'
  | 'rolling'
  | 'diceLanded'
  | 'movingPawn'
  | 'resolvingSnakeLadder'
  | 'turnComplete';

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
