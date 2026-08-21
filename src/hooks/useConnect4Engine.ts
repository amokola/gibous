import { useState, useCallback, useRef } from 'react';
import { Connect4Board, MatchType, PlayerId, WinningCoord } from '../types/game';
import {
  createEmptyConnect4Board,
  getLowestEmptyRow,
  checkConnect4Win,
  isBoardFull,
} from '../config/connect4Config';
import { useSoundEffects } from './useSoundEffects';
import { useTelegram } from './useTelegram';

export function useConnect4Engine(
  _matchType: MatchType,
  potAmount: number,
  onGameOver: (winner: PlayerId, pot: number) => void
) {
  const sounds = useSoundEffects();
  const { haptic } = useTelegram();

  const [board, setBoard] = useState<Connect4Board>(() => createEmptyConnect4Board());
  const [activePlayer, setActivePlayer] = useState<PlayerId>('p1');
  const [winningCells, setWinningCells] = useState<WinningCoord[] | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [p1Wins, setP1Wins] = useState<number>(0);
  const [p2Wins, setP2Wins] = useState<number>(0);

  const isAnimatingRef = useRef(false);
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Reset Game
  const resetGame = useCallback(() => {
    setBoard(createEmptyConnect4Board());
    setActivePlayer('p1');
    setWinningCells(null);
    setIsProcessing(false);
    isAnimatingRef.current = false;
  }, []);

  // Drop disc into column
  const dropDisc = useCallback(
    async (col: number) => {
      if (isAnimatingRef.current || winningCells) return;

      const row = getLowestEmptyRow(board, col);
      if (row === -1) return;

      isAnimatingRef.current = true;
      setIsProcessing(true);

      const currentPlayer = activePlayer;
      sounds.playDiscDrop(row);
      haptic.impact('light');

      // Update board with new disc
      const newBoard = board.map(r => [...r]);
      newBoard[row][col] = currentPlayer;
      setBoard(newBoard);

      await sleep(220);

      // Check win
      const win = checkConnect4Win(newBoard);
      if (win) {
        setWinningCells(win.winningCells);
        sounds.playVictory();
        haptic.notification('success');

        if (win.winner === 'p1') {
          setP1Wins(prev => prev + 1);
        } else {
          setP2Wins(prev => prev + 1);
        }

        await sleep(1100);
        isAnimatingRef.current = false;
        setIsProcessing(false);
        onGameOver(win.winner, potAmount);
        return;
      }

      // Check draw
      if (isBoardFull(newBoard)) {
        await sleep(400);
        isAnimatingRef.current = false;
        setIsProcessing(false);
        resetGame();
        return;
      }

      // Switch Turns
      const nextPlayer: PlayerId = currentPlayer === 'p1' ? 'p2' : 'p1';
      setActivePlayer(nextPlayer);
      isAnimatingRef.current = false;
      setIsProcessing(false);
    },
    [board, activePlayer, winningCells, sounds, haptic, potAmount, onGameOver, resetGame]
  );

  return {
    board,
    activePlayer,
    winningCells,
    isProcessing,
    p1Wins,
    p2Wins,
    dropDisc,
    resetGame,
  };
}
