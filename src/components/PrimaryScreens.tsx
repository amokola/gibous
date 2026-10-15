import React from 'react';
import { HomeScreen } from './home/HomeScreen';
import { LobbyScreen } from './lobby/LobbyScreen';

type PrimaryScreensProps =
  | {
      screen: 'home';
      homeProps: React.ComponentProps<typeof HomeScreen>;
      lobbyProps: React.ComponentProps<typeof LobbyScreen>;
    }
  | {
      screen: 'lobby';
      homeProps: React.ComponentProps<typeof HomeScreen>;
      lobbyProps: React.ComponentProps<typeof LobbyScreen>;
    };

export const PrimaryScreens: React.FC<PrimaryScreensProps> = ({ screen, homeProps, lobbyProps }) => (
  screen === 'home' ? (
    <HomeScreen {...homeProps} />
  ) : (
    <div className="flex-1 min-h-0 flex flex-col">
      <LobbyScreen {...lobbyProps} />
    </div>
  )
);
