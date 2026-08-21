import { useState, useCallback, useRef } from 'react';
import { MatchType, PlayerId, RPSChoice } from '../types/game';
import { evaluateRPSRound, TARGET_WINS } from '../config/rpsConfig';
import { useSoundEffects } from './useSoundEffects';
import { useTelegram } from './useTelegram';

export function useRPSEngine(
  _matchType: MatchType,
  potAmount: number,
  onGameOver: (winner: PlayerId, pot: number) => void
) {
  const sounds = useSoundEffects();
  const { haptic } = useTelegram();

  const [p1Wins, setP1Wins] = useState<number>(0);
  const [p2Wins, setP2Wins] = useState<number>(0);
  const [p1Choice, setP1Choice] = useState<RPSChoice | null>(null);
  const [p2Choice, setP2Choice] = useState<RPSChoice | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [roundWinner, setRoundWinner] = useState<PlayerId | 'draw' | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDoubleClash, setIsDoubleClash] = useState<boolean>(false);

  const isLockedRef = useRef(false);
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Reset Game
  const resetGame = useCallback(() => {
    setP1Wins(0);
    setP2Wins(0);
    setP1Choice(null);
    setP2Choice(null);
    setCountdown(null);
    setRoundWinner(null);
    setIsProcessing(false);
    setIsDoubleClash(false);
    isLockedRef.current = false;
  }, []);

  // Play Choice
  const playMove = useCallback(
    async (choice: RPSChoice) => {
      if (isLockedRef.current || isProcessing) return;
      isLockedRef.current = true;
      setIsProcessing(true);

      sounds.playCardFlip();
      haptic.impact('light');

      setP1Choice(choice);
      setRoundWinner(null);

      // In real PVP match or simulated online duel, opponent makes move
      const choices: RPSChoice[] = ['rock', 'paper', 'scissors'];
      const opponentChoice = choices[Math.floor(Math.random() * choices.length)];
      setP2Choice(opponentChoice);

      // 3-step dramatic countdown
      setCountdown(3);
      sounds.playCountdown(400);
      await sleep(380);

      setCountdown(2);
      sounds.playCountdown(500);
      await sleep(380);

      setCountdown(1);
      sounds.playCountdown(600);
      await sleep(380);

      setCountdown(null);

      // Clash Reveal
      sounds.playClash();
      haptic.impact('heavy');

      const outcome = evaluateRPSRound(choice, opponentChoice);
      setRoundWinner(outcome);

      let nextP1Wins = p1Wins;
      let nextP2Wins = p2Wins;

      if (outcome === 'p1') {
        nextP1Wins += 1;
        setP1Wins(nextP1Wins);
        setIsDoubleClash(false);
        haptic.notification('success');
      } else if (outcome === 'p2') {
        nextP2Wins += 1;
        setP2Wins(nextP2Wins);
        setIsDoubleClash(false);
        haptic.notification('error');
      } else {
        setIsDoubleClash(true);
      }

      // Check Victory Condition (First to 3)
      if (nextP1Wins >= TARGET_WINS || nextP2Wins >= TARGET_WINS) {
        await sleep(1100);
        sounds.playVictory();
        haptic.notification('success');
        const winner = nextP1Wins >= TARGET_WINS ? 'p1' : 'p2';
        isLockedRef.current = false;
        setIsProcessing(false);
        onGameOver(winner, potAmount);
        return;
      }

      await sleep(950);
      isLockedRef.current = false;
      setIsProcessing(false);
    },
    [isProcessing, sounds, haptic, p1Wins, p2Wins, potAmount, onGameOver]
  );

  return {
    p1Wins,
    p2Wins,
    p1Choice,
    p2Choice,
    countdown,
    roundWinner,
    isProcessing,
    isDoubleClash,
    targetWins: TARGET_WINS,
    playMove,
    resetGame,
  };
}
