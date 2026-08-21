import crypto from 'crypto';

export interface VerifiedTelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

export class TelegramAuth {
  private botToken: string;

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || 'DEMO_BOT_TOKEN';
  }

  /**
   * Cryptographically verify Telegram initData string using HMAC-SHA256
   * @param initData Raw initData string from Telegram WebApp
   */
  verifyInitData(initData: string): { valid: boolean; user?: VerifiedTelegramUser; error?: string } {
    if (!initData) {
      return { valid: false, error: 'Empty initData string' };
    }

    try {
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');

      if (!hash) {
        return { valid: false, error: 'Missing hash in initData' };
      }

      urlParams.delete('hash');

      // Sort keys alphabetically
      const dataCheckArr: string[] = [];
      const sortedKeys = Array.from(urlParams.keys()).sort();
      for (const key of sortedKeys) {
        dataCheckArr.push(`${key}=${urlParams.get(key)}`);
      }
      const dataCheckString = dataCheckArr.join('\n');

      // Generate secret key: HMAC-SHA256 of bot token with constant string "WebAppData"
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(this.botToken)
        .digest();

      // Compute hash of dataCheckString using secretKey
      const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      const isSignatureValid = computedHash === hash;

      // Extract user object
      const userString = urlParams.get('user');
      let user: VerifiedTelegramUser | undefined;
      if (userString) {
        user = JSON.parse(userString);
      }

      // If in development/demo mode without real bot token, allow fallback if user is parsed
      if (this.botToken === 'DEMO_BOT_TOKEN' && user) {
        return { valid: true, user };
      }

      if (!isSignatureValid) {
        return { valid: false, error: 'Invalid HMAC signature' };
      }

      return { valid: true, user };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }
}
