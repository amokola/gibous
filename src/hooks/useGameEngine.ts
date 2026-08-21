import { useState, useCallback, useEffect, useRef } from 'react';
import {
  GameState,
  GameSettings,
  PlayerId,
  TurnHistoryStep,
  MatchType,
} from '../types/game';
import { SNAKES, LADDERS } from '../config/boardConfig';
import { useSoundEffects } from './useSoundEffects';
import { useTelegram } from './useTelegram';

const INITIAL_SETTINGS: GameSettings = {
  mode: 'classic',
  boardSize: 100,
  winningAmount: 100,
};

export function useGameEngine() {
  const [screen, setScreen] = useState<'home' | 'lobby' | 'game' | 'gameover'>('home');
  const { user: tgUser, haptic } = useTelegram();
  const sounds = useSoundEffects();

  // Animation and visual tracking
  const [p1Trail, setP1Trail] = useState<number | null>(null);
  const [p2Trail, setP2Trail] = useState<number | null>(null);
  const [highlightedTile, setHighlightedTile] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Tap dice to roll');
  const [actionTicker, setActionTicker] = useState<{ message: string; type: 'roll' | 'ladder' | 'snake' | 'info' }>({
    message: 'Match Ready • Tap Dice to Roll',
    type: 'info',
  });

  const [gameState, setGameState] = useState<GameState>({
    roomCode: 'X9K4L2',
    matchType: 'online',
    settings: INITIAL_SETTINGS,
    players: {
      p1: {
        id: 'p1',
        name: tgUser.first_name || 'Player 1',
        username: tgUser.username,
        telegramId: tgUser.id,
        avatarUrl: tgUser.photo_url || '',
        color: 'green',
        score: 1,
        isReady: true,
      },
      p2: {
        id: 'p2',
        name: 'Player 2',
        username: 'opponent_master',
        avatarUrl: '',
        color: 'blue',
        score: 1,
        isReady: true,
      },
    },
    activePlayer: 'p1',
    turnPhase: 'WAITING_ROLL',
    lastDiceRoll: null,
    history: [],
    winner: null,
    potAmount: 200,
    isHost: true,
  });

  // Sync Telegram user if available
  useEffect(() => {
    if (tgUser.first_name || tgUser.id) {
      setGameState(prev => ({
        ...prev,
        players: {
          ...prev.players,
          p1: {
            ...prev.players.p1,
            name: tgUser.first_name || 'Player 1',
            username: tgUser.username,
            telegramId: tgUser.id,
            avatarUrl: tgUser.photo_url || prev.players.p1.avatarUrl,
          },
        },
      }));
    }
  }, [tgUser]);

  const animatingRef = useRef(false);
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Change settings
  const updateSettings = useCallback((newSettings: Partial<GameSettings>) => {
    setGameState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...newSettings },
      potAmount: (newSettings.winningAmount ?? prev.settings.winningAmount) * 2,
    }));
  }, []);

  const setMatchType = useCallback((type: MatchType) => {
    setGameState(prev => ({
      ...prev,
      matchType: type,
    }));
  }, []);

  // Start game from lobby
  const startGame = useCallback(() => {
    sounds.playMatchFound();
    haptic.impact('heavy');

    setGameState(prev => ({
      ...prev,
      players: {
        p1: { ...prev.players.p1, score: 1 },
        p2: { ...prev.players.p2, score: 1 },
      },
      activePlayer: 'p1',
      turnPhase: 'WAITING_ROLL',
      lastDiceRoll: null,
      history: [],
      winner: null,
      potAmount: prev.settings.winningAmount * 2,
    }));

    setP1Trail(null);
    setP2Trail(null);
    setHighlightedTile(null);
    setStatusMessage('Match Started • Tap Dice to Roll');
    setActionTicker({
      message: '⚔️ Match Started • Player 1 to Roll',
      type: 'info',
    });

    setScreen('game');
  }, [sounds, haptic]);

  // Execute Step-by-Step Movement along the 100 tiles
  const executeMovement = useCallback(
    async (player: PlayerId, steps: number) => {
      animatingRef.current = true;
      const currentScore = gameState.players[player].score;
      let targetTile = currentScore + steps;

      // Bounce back rule if overshoot tile 100
      if (targetTile > 100) {
        const overshoot = targetTile - 100;
        targetTile = 100 - overshoot;
      }

      setGameState(prev => ({ ...prev, turnPhase: 'MOVING' }));

      // Step-by-step moving animation
      let currentPos = currentScore;
      const stepDirection = currentScore < targetTile ? 1 : -1;
      const totalSteps = Math.abs(targetTile - currentScore);

      for (let i = 0; i < totalSteps; i++) {
        currentPos += stepDirection;
        sounds.playStep();
        haptic.impact('light');

        setGameState(prev => ({
          ...prev,
          players: {
            ...prev.players,
            [player]: {
              ...prev.players[player],
              score: currentPos,
            },
          },
        }));

        if (player === 'p1') {
          setP1Trail(currentPos);
        } else {
          setP2Trail(currentPos);
        }

        await sleep(140);
      }

      // Check Victory Condition
      if (targetTile === 100) {
        await sleep(300);
        sounds.playVictory();
        haptic.notification('success');

        const winnerPlayer = gameState.players[player];
        setActionTicker({
          message: `👑 ${winnerPlayer.name} Reached Tile 100 & WON!`,
          type: 'info',
        });

        setGameState(prev => ({
          ...prev,
          winner: player,
          turnPhase: 'GAME_OVER',
        }));

        await sleep(1200);
        setScreen('gameover');
        animatingRef.current = false;
        return;
      }

      // Check Ladders
      const ladder = LADDERS.find(l => l.bottom === targetTile);
      if (ladder) {
        await sleep(300);
        sounds.playLadder();
        haptic.notification('success');
        setActionTicker({
          message: `🪜 Climbed ladder from ${ladder.bottom} to tile ${ladder.top}!`,
          type: 'ladder',
        });
        setGameState(prev => ({ ...prev, turnPhase: 'CLIMBING_LADDER' }));
        setHighlightedTile(ladder.top);

        if (player === 'p1') {
          setP1Trail(ladder.bottom);
        } else {
          setP2Trail(ladder.bottom);
        }

        await sleep(450);
        setGameState(prev => ({
          ...prev,
          players: {
            ...prev.players,
            [player]: {
              ...prev.players[player],
              score: ladder.top,
            },
          },
        }));
        await sleep(350);
        setHighlightedTile(null);
        targetTile = ladder.top;
      }

      // Check Snakes
      const snake = SNAKES.find(s => s.head === targetTile);
      if (snake) {
        await sleep(300);
        sounds.playSnake();
        haptic.notification('error');
        setActionTicker({
          message: `🐍 Slid down snake from ${snake.head} to tile ${snake.tail}!`,
          type: 'snake',
        });
        setGameState(prev => ({ ...prev, turnPhase: 'SLIDING_SNAKE' }));
        setHighlightedTile(snake.tail);

        if (player === 'p1') {
          setP1Trail(snake.head);
        } else {
          setP2Trail(snake.head);
        }

        await sleep(450);
        setGameState(prev => ({
          ...prev,
          players: {
            ...prev.players,
            [player]: {
              ...prev.players[player],
              score: snake.tail,
            },
          },
        }));
        await sleep(350);
        setHighlightedTile(null);
        targetTile = snake.tail;
      }

      // Record Turn in history
      const historyStep: TurnHistoryStep = {
        player,
        from: currentScore,
        diceRoll: steps,
        to: targetTile,
        snakeOrLadder: ladder
          ? { type: 'ladder', from: ladder.bottom, to: ladder.top }
          : snake
          ? { type: 'snake', from: snake.head, to: snake.tail }
          : undefined,
      };

      // Switch Turns
      const nextPlayer: PlayerId = player === 'p1' ? 'p2' : 'p1';

      setGameState(prev => ({
        ...prev,
        history: [...prev.history, historyStep],
        activePlayer: nextPlayer,
        turnPhase: 'WAITING_ROLL',
      }));

      animatingRef.current = false;
    },
    [gameState.players, sounds, haptic]
  );

  // Roll Dice Action (Fair 1-6 standard die)
  const rollDice = useCallback(async () => {
    if (gameState.turnPhase !== 'WAITING_ROLL' || animatingRef.current) return;

    sounds.playDiceRoll();
    haptic.impact('medium');

    setGameState(prev => ({ ...prev, turnPhase: 'ROLLING' }));
    setStatusMessage('Rolling...');

    const rolled = Math.floor(Math.random() * 6) + 1;

    // Roll physics duration
    await sleep(600);

    setGameState(prev => ({
      ...prev,
      lastDiceRoll: rolled,
    }));

    const playerName = gameState.players[gameState.activePlayer].name;
    setStatusMessage(`${playerName} rolled ${rolled}`);
    setActionTicker({
      message: `🎲 ${playerName} rolled a ${rolled}!`,
      type: 'roll',
    });

    await sleep(300);
    await executeMovement(gameState.activePlayer, rolled);
  }, [gameState.turnPhase, gameState.activePlayer, gameState.players, sounds, haptic, executeMovement]);

  return {
    screen,
    setScreen,
    gameState,
    p1Trail,
    p2Trail,
    highlightedTile,
    statusMessage,
    actionTicker,
    sounds,
    startGame,
    rollDice,
    updateSettings,
    setMatchType,
    resetToLobby: () => {
      sounds.playClick();
      setScreen('lobby');
    },
  };
}
