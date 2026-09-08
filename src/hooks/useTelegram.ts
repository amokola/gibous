import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '../config/brand';
import type { TelegramSafeAreaInset } from '../utils/telegramSafeArea';
import { requestPreparedBragShare } from '../services/telegramBragService';

// Telegram WebApp Type Declarations
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        version?: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData: string;
        initDataUnsafe?: {
          query_id?: string;
          user?: TelegramUser;
          receiver?: TelegramUser;
          start_param?: string;
          auth_date?: string;
          hash?: string;
        };
        themeParams?: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        safeAreaInset?: TelegramSafeAreaInset;
        contentSafeAreaInset?: TelegramSafeAreaInset;
        headerColor: string;
        backgroundColor: string;
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        BackButton: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (cb: () => void) => void;

          offClick: (cb: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive: boolean) => void;
          hideProgress: () => void;
        };
        openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
        openTelegramLink: (url: string) => void;
        shareMessage?: (messageId: string, callback?: (sent: boolean) => void) => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation?: () => void;
        isVersionAtLeast?: (version: string) => boolean;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        requestFullscreen?: () => void;
        exitFullscreen?: () => void;
      };
    };
  }
}

export function useTelegram() {
  const [tg] = useState(() => (typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined));
  const isAvailable = Boolean(tg);

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        const versionAtLeast = (required: string) => {
          if (typeof tg.isVersionAtLeast === 'function') {
            return tg.isVersionAtLeast(required);
          }
          if (!tg.version) return false;
          const current = tg.version.split('.').map(Number);
          const target = required.split('.').map(Number);
          return target.every((part, index) => (current[index] || 0) >= part || current.slice(0, index).some((value, i) => value > (target[i] || 0)));
        };

        // Telegram 6.1 introduced headerColor / backgroundColor
        if (versionAtLeast('6.1')) {
          tg.setHeaderColor('#f2efe9');
          tg.setBackgroundColor('#f2efe9');
        }

        // Bot API 7.7 introduced disableVerticalSwipes to prevent accidental app pull-down while playing
        if (versionAtLeast('7.7') && typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
      } catch {
        // Fallback for older client versions
      }
    }
  }, [tg]);

  const initData = useMemo(() => {
    if (tg?.initData) return tg.initData;
    if (typeof window !== 'undefined') {
      try {
        const hash = window.location.hash.slice(1);
        if (hash) {
          const hashParams = new URLSearchParams(hash);
          const fromHash = hashParams.get('tgWebAppData');
          if (fromHash) return fromHash;
        }
        const searchParams = new URLSearchParams(window.location.search);
        const fromSearch = searchParams.get('tgWebAppData');
        if (fromSearch) return fromSearch;
      } catch {
        // ignore
      }
    }
    return '';
  }, [tg]);

  const startParam = useMemo(() => {
    if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param;
    if (initData) {
      try {
        const fromInit = new URLSearchParams(initData).get('start_param');
        if (fromInit) return fromInit;
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const search = new URLSearchParams(window.location.search);
        const fromStartApp = search.get('startapp') || search.get('tgWebAppStartParam');
        if (fromStartApp) return fromStartApp;

        const hash = window.location.hash.slice(1);
        if (hash) {
          const fromHash = new URLSearchParams(hash).get('tgWebAppStartParam');
          if (fromHash) return fromHash;
        }
      } catch {
        // ignore
      }
    }
    return '';
  }, [tg, initData]);

  const user: TelegramUser = useMemo(() => {
    if (tg?.initDataUnsafe?.user) {
      return tg.initDataUnsafe.user;
    }

    if (initData) {
      try {
        const params = new URLSearchParams(initData);
        const userJson = params.get('user');
        if (userJson) {
          const parsed = JSON.parse(userJson);
          if (parsed?.id) {
            return {
              id: parsed.id,
              first_name: parsed.first_name || `Player_${parsed.id}`,
              last_name: parsed.last_name,
              username: parsed.username,
              photo_url: parsed.photo_url || '',
              language_code: parsed.language_code,
              is_premium: parsed.is_premium,
            };
          }
        }
      } catch {
        // fallback to guest id below
      }
    }

    // Unique session ID per browser tab for standalone preview / multi-tab testing
    let guestId = 123456789;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem('gibous_mock_tg_id');
      if (stored) {
        guestId = parseInt(stored, 10);
      } else {
        guestId = Math.floor(100000000 + Math.random() * 900000000);
        window.sessionStorage.setItem('gibous_mock_tg_id', String(guestId));
      }
    }

    return {
      id: guestId,
      first_name: `Player ${guestId.toString().slice(-4)}`,
      username: `player_${guestId.toString().slice(-4)}`,
      photo_url: '',
    };
  }, [tg, initData]);

  const sharePreparedBragCard = useCallback(() => {
    return requestPreparedBragShare(initData, tg || {});
  }, [initData, tg]);

  const shareRoomInvite = (roomCode: string, betAmount: number) => {
    const text = `⚔️ Duel me on Gibous!\n🎲 Room: ${roomCode}\n💎 Pot: ${betAmount * 2} GRAM\n\nTap to play!`;
    const botUrl = `https://t.me/share/url?url=${encodeURIComponent(`${BRAND.links.botAppUrl}?startapp=${roomCode}`)}&text=${encodeURIComponent(text)}`;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(botUrl);
    } else {
      window.open(botUrl, '_blank');
    }
  };

  const showBackButton = useCallback((onClick: () => void) => {
    if (tg?.BackButton) {
      try {
        tg.BackButton.show();
        tg.BackButton.onClick(onClick);
      } catch {
        // ignore
      }
    }
  }, [tg]);

  const hideBackButton = useCallback((onClick?: () => void) => {
    if (tg?.BackButton) {
      try {
        if (onClick) tg.BackButton.offClick(onClick);
        tg.BackButton.hide();
      } catch {
        // ignore
      }
    }
  }, [tg]);

  const enableClosingConfirmation = useCallback(() => {
    if (tg && typeof tg.enableClosingConfirmation === 'function') {
      try {
        tg.enableClosingConfirmation();
      } catch {
        // ignore
      }
    }
  }, [tg]);

  const disableClosingConfirmation = useCallback(() => {
    if (tg && typeof tg.disableClosingConfirmation === 'function') {
      try {
        tg.disableClosingConfirmation();
      } catch {
        // ignore
      }
    }
  }, [tg]);

  return {
    tg,
    isAvailable,
    user,
    initData,
    startParam,
    sharePreparedBragCard,
    shareRoomInvite,
    showBackButton,
    hideBackButton,
    enableClosingConfirmation,
    disableClosingConfirmation,
  };
}
