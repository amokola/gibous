import { useEffect, useMemo, useState } from 'react';

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
        headerColor: string;
        backgroundColor: string;
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
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
        openTelegramLink: (url: string) => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        enableClosingConfirmation: () => void;
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
        tg.setHeaderColor('#f2efe9');
        tg.setBackgroundColor('#f2efe9');
        tg.enableClosingConfirmation();
      } catch {
        // Fallback for older client versions
      }
    }
  }, [tg]);

  const startParam = useMemo(() => {
    return tg?.initDataUnsafe?.start_param || '';
  }, [tg]);

  const user: TelegramUser = useMemo(() => {
    if (tg?.initDataUnsafe?.user) {
      return tg.initDataUnsafe.user;
    }
    // High-quality fallback for standalone browser preview / testing
    return {
      id: 123456789,
      first_name: 'You',
      username: 'ton_master',
      photo_url: '',
    };
  }, [tg]);

  const haptic = useMemo(() => ({
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
      try {
        tg?.HapticFeedback?.impactOccurred(style);
      } catch {
        // Ignore fallback
      }
    },
    notification: (type: 'error' | 'success' | 'warning') => {
      try {
        tg?.HapticFeedback?.notificationOccurred(type);
      } catch {
        // Ignore fallback
      }
    },
    selection: () => {
      try {
        tg?.HapticFeedback?.selectionChanged();
      } catch {
        // Ignore fallback
      }
    },
  }), [tg]);

  const shareRoomInvite = (roomCode: string, betAmount: number) => {
    const text = `⚔️ Duel me on Gibous Duel Arena!\n🎲 Room Code: ${roomCode}\n💎 Pot: ${betAmount * 2} Play GRAM (10% Arena Fee on win | 95% Draw Refund)\n\nTap to play now!`;
    const botUrl = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/gibous_bot/app?startapp=${roomCode}`)}&text=${encodeURIComponent(text)}`;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(botUrl);
    } else {
      window.open(botUrl, '_blank');
    }
  };

  const initData = useMemo(() => {
    return tg?.initData || '';
  }, [tg]);

  return {
    tg,
    isAvailable,
    user,
    initData,
    haptic,
    startParam,
    shareRoomInvite,
  };
}
