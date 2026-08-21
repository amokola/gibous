import React, { useState } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { useTelegram } from './hooks/useTelegram';
import { useMultiplayer } from './hooks/useMultiplayer';
import { ConnectionBanner } from './components/ui/ConnectionBanner';
import { OpponentStatusOverlay } from './components/game/OpponentStatusOverlay';
import { GameTitle, PlayerId, ScreenState } from './types/game';
import { HomeScreen } from './components/home/HomeScreen';
import { LobbyScreen } from './components/lobby/LobbyScreen';
import { GameScreen } from './components/game/GameScreen';
import { Connect4Screen } from './components/connect4/Connect4Screen';
import { RPSScreen } from './components/rps/RPSScreen';
import { GameOverScreen } from './components/gameover/GameOverScreen';

export const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('home');
  const [selectedGame, setSelectedGame] = useState<GameTitle>('snake');
  const [userBalance, setUserBalance] = useState<number>(2450);
  const [customWinner, setCustomWinner] = useState<PlayerId | null>(null);

  const { connectionState, service, opponentDisconnected, opponentReconnected } = useMultiplayer();

  const {
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
  } = useGameEngine();

  const { shareRoomInvite, user: tgUser } = useTelegram();

  const handleShare = () => {
    shareRoomInvite(gameState.roomCode, gameState.settings.winningAmount);
  };

  // Launch a game from the Landing page
  const handleSelectAndPlayGame = (game: GameTitle) => {
    sounds.playClick();
    setSelectedGame(game);
    setCurrentScreen('lobby');
  };

  const handleStartGameFromLobby = () => {
    setCustomWinner(null);
    startGame();
    setCurrentScreen('game');
  };

  const handleCustomGameOver = (winner: PlayerId, _pot: number) => {
    setCustomWinner(winner);
    setCurrentScreen('gameover');
  };

  const activeWinner = selectedGame === 'snake' ? gameState.winner : customWinner;

  return (
    <div className="min-h-screen w-full bg-[#e8e0d0] flex items-center justify-center p-0 sm:p-3 text-[#1a1a1a] overflow-hidden select-none">
      {/* Mobile Device Mockup Frame */}
      <div className="w-full max-w-[420px] h-screen sm:h-[860px] sm:max-h-[96vh] bg-[#fbfaf7] sm:rounded-[36px] sm:border-[4px] sm:border-[#1a1a1a] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-y-auto overflow-x-hidden relative flex flex-col justify-between scrollbar-none">
        <ConnectionBanner
          connectionState={connectionState}
          onReconnect={() => service.connect()}
        />

        {currentScreen === 'game' && (
          <OpponentStatusOverlay
            opponentDisconnected={opponentDisconnected}
            opponentReconnected={opponentReconnected}
          />
        )}

        {/* 1. Main Landing Page Hub */}
        {currentScreen === 'home' && (
          <HomeScreen
            userName={tgUser.first_name || 'Player 1'}
            avatarUrl={tgUser.photo_url}
            balance={userBalance}
            isMuted={sounds.isMuted}
            onToggleMute={sounds.toggleMute}
            onSelectAndPlayGame={handleSelectAndPlayGame}
            onUpdateBalance={setUserBalance}
          />
        )}

        {/* 2. Matchmaking Lobby */}
        {currentScreen === 'lobby' && (
          <div className="flex-1 flex flex-col justify-between">
            <LobbyScreen
              selectedGame={selectedGame}
              onSelectGame={setSelectedGame}
              roomCode={gameState.roomCode}
              p1={gameState.players.p1}
              p2={gameState.players.p2}
              isReady={gameState.players.p1.isReady && gameState.players.p2.isReady}
              matchType={gameState.matchType}
              settings={gameState.settings}
              isMuted={sounds.isMuted}
              onToggleMute={sounds.toggleMute}
              onSetMatchType={setMatchType}
              onChangeSettings={updateSettings}
              onStartGame={handleStartGameFromLobby}
              onShare={handleShare}
              onBack={() => setCurrentScreen('home')}
            />
          </div>
        )}

        {/* 3. In-Game: Snake & Ladder */}
        {currentScreen === 'game' && selectedGame === 'snake' && (
          <div className="flex-1 flex flex-col justify-between">
            <GameScreen
              gameState={gameState}
              p1Trail={p1Trail}
              p2Trail={p2Trail}
              highlightedTile={highlightedTile}
              statusText={statusMessage}
              actionTicker={actionTicker}
              onRollDice={rollDice}
              onBack={() => setCurrentScreen('lobby')}
            />
          </div>
        )}

        {/* 4. In-Game: Four in a Row */}
        {currentScreen === 'game' && selectedGame === 'connect4' && (
          <div className="flex-1 flex flex-col justify-between">
            <Connect4Screen
              p1={gameState.players.p1}
              p2={gameState.players.p2}
              matchType={gameState.matchType}
              potAmount={gameState.potAmount}
              onGameOver={handleCustomGameOver}
              onBack={() => setCurrentScreen('lobby')}
            />
          </div>
        )}

        {/* 5. In-Game: Rock Paper Scissors */}
        {currentScreen === 'game' && selectedGame === 'rps' && (
          <div className="flex-1 flex flex-col justify-between">
            <RPSScreen
              p1={gameState.players.p1}
              p2={gameState.players.p2}
              matchType={gameState.matchType}
              potAmount={gameState.potAmount}
              onGameOver={handleCustomGameOver}
              onBack={() => setCurrentScreen('lobby')}
            />
          </div>
        )}

        {/* 6. Game Over / Victory Screen */}
        {currentScreen === 'gameover' && activeWinner && (
          <div className="flex-1 flex flex-col justify-between">
            <GameOverScreen
              winnerId={activeWinner}
              p1={gameState.players.p1}
              p2={gameState.players.p2}
              potAmount={gameState.potAmount}
              onPlayAgain={() => {
                setCustomWinner(null);
                handleStartGameFromLobby();
              }}
              onBackToLobby={() => {
                setCustomWinner(null);
                setCurrentScreen('home');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
