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

// Telegram Ed25519 Public Keys for Bot API 8.0+ third-party verification
const TG_PROD_PUBLIC_KEY = crypto.createPublicKey({
  key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from('e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d', 'hex'),
  ]),
  format: 'der',
  type: 'spki',
});

const TG_TEST_PUBLIC_KEY = crypto.createPublicKey({
  key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from('40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec', 'hex'),
  ]),
  format: 'der',
  type: 'spki',
});

export class TelegramAuth {
  private botToken?: string;
  private readonly maxAuthAgeSeconds: number;
  private readonly usedHashes = new Map<string, number>();

  constructor(botToken?: string, options?: { maxAuthAgeSeconds?: number }) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN;
    this.maxAuthAgeSeconds = options?.maxAuthAgeSeconds ?? (Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS) || 86400);
  }

  public getEffectiveToken(): string | undefined {
    return this.botToken;
  }

  /**
   * Cryptographically verify Telegram initData string using HMAC-SHA256
   * @param initData Raw initData string from Telegram WebApp
   */
  verifyInitData(
    initData: string,
    options: { consumeReplay?: boolean; maxAuthAgeSeconds?: number } = {},
  ): { valid: boolean; user?: VerifiedTelegramUser; error?: string } {
    const consumeReplay = options.consumeReplay ?? true;
    const maxAge = options.maxAuthAgeSeconds ?? this.maxAuthAgeSeconds;

    if (!initData || typeof initData !== 'string') {
      return { valid: false, error: 'Empty initData string' };
    }

    try {
      const trimmed = initData.trim().replace(/^[?#]/, '');
      let urlParams = new URLSearchParams(trimmed);
      let hash = urlParams.get('hash');

      // Attempt decodeURIComponent recovery if initData was URL-encoded twice
      if (!hash && trimmed.includes('%')) {
        try {
          const decoded = decodeURIComponent(trimmed);
          const candidateParams = new URLSearchParams(decoded);
          if (candidateParams.get('hash')) {
            urlParams = candidateParams;
            hash = candidateParams.get('hash');
          }
        } catch {
          // ignore decode failure
        }
      }

      if (!hash) {
        return { valid: false, error: 'Missing hash in initData' };
      }

      const authDate = Number(urlParams.get('auth_date'));
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isSafeInteger(authDate)) {
        return { valid: false, error: 'Missing or invalid auth_date' };
      }
      if (authDate > now + 120 || now - authDate > maxAge) {
        return { valid: false, error: 'Telegram initData expired' };
      }

      if (consumeReplay) {
        for (const [usedHash, expiresAt] of this.usedHashes) {
          if (expiresAt <= now) this.usedHashes.delete(usedHash);
        }
        const replayExpiresAt = this.usedHashes.get(hash);
        if (replayExpiresAt && replayExpiresAt > now) {
          return { valid: false, error: 'Telegram initData replayed' };
        }
      }

      // Extract third-party Ed25519 signature before deleting
      const signature = urlParams.get('signature');
      urlParams.delete('hash');
      urlParams.delete('signature');

      // Sort unique keys alphabetically
      const dataCheckArr: string[] = [];
      const sortedKeys = Array.from(new Set(urlParams.keys())).sort();
      for (const key of sortedKeys) {
        dataCheckArr.push(`${key}=${urlParams.get(key)}`);
      }
      const dataCheckString = dataCheckArr.join('\n');

      const effectiveToken = this.getEffectiveToken();
      const userString = urlParams.get('user');
      if (!userString) {
        return { valid: false, error: 'Missing Telegram user data' };
      }

      let user: VerifiedTelegramUser;
      try {
        user = JSON.parse(userString) as VerifiedTelegramUser;
      } catch {
        return { valid: false, error: 'Invalid Telegram user data' };
      }
      if (!Number.isSafeInteger(user.id) || user.id <= 0) {
        return { valid: false, error: 'Invalid Telegram user data' };
      }
      if (typeof user.first_name !== 'string' || !user.first_name.trim()) {
        user.first_name = user.username || `Player_${user.id}`;
      }

      if (!effectiveToken) {
        return { valid: false, error: 'Telegram authentication is not configured' };
      }

      // Generate secret key: HMAC-SHA256 of bot token with constant string "WebAppData"
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(effectiveToken)
        .digest();

      // Compute hash of dataCheckString using secretKey
      const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      const isHexHash = /^[a-fA-F0-9]{64}$/.test(hash);
      const expectedHash = Buffer.from(computedHash, 'hex');
      const receivedHash = isHexHash ? Buffer.from(hash, 'hex') : Buffer.alloc(0);
      const isSignatureValid = isHexHash &&
        expectedHash.length === receivedHash.length &&
        crypto.timingSafeEqual(expectedHash, receivedHash);

      let isEd25519Valid = false;
      if (!isSignatureValid && signature) {
        try {
          const botId = effectiveToken.split(':')[0];
          const ed25519DataCheckString = `${botId}:WebAppData\n${dataCheckString}`;
          const sigBuffer = Buffer.from(signature, 'base64url');
          isEd25519Valid =
            crypto.verify(null, Buffer.from(ed25519DataCheckString), TG_PROD_PUBLIC_KEY, sigBuffer) ||
            crypto.verify(null, Buffer.from(ed25519DataCheckString), TG_TEST_PUBLIC_KEY, sigBuffer);
        } catch {
          // Ignore ed25519 error
        }
      }

      if (!isSignatureValid && !isEd25519Valid) {
        console.warn('❌ Telegram auth verification failed:', {
          rawInitData: trimmed,
          receivedHash: hash,
          computedHash,
          tokenPrefix: effectiveToken?.slice(0, 12),
          dataCheckString,
          hasSignature: Boolean(signature),
        });
        return { valid: false, error: 'Invalid HMAC signature' };
      }

      if (consumeReplay) {
        this.usedHashes.set(hash, now + maxAge);
      }
      return { valid: true, user };
    } catch {
      return { valid: false, error: 'Invalid Telegram authentication data' };
    }
  }
}
