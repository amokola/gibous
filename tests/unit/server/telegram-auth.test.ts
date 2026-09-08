import { describe, it, expect } from 'vitest';
import { TelegramAuth } from '../../../server/auth';
import { generateValidInitData, TEST_BOT_TOKEN } from '../../setup/mock-data';

describe('TelegramAuth Unit Tests', () => {
  const auth = new TelegramAuth(TEST_BOT_TOKEN);

  it('should successfully verify valid Telegram initData signature', () => {
    const validUser = {
      id: 123456789,
      first_name: 'Pavel',
      last_name: 'Durov',
      username: 'durov',
    };

    const validInitData = generateValidInitData(validUser, TEST_BOT_TOKEN);
    const result = auth.verifyInitData(validInitData);

    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(123456789);
    expect(result.user?.first_name).toBe('Pavel');
    expect(result.user?.username).toBe('durov');
  });

  it('should reject initData when HMAC signature does not match (tampered user data)', () => {
    const validUser = { id: 123456789, first_name: 'Pavel' };
    const validInitData = generateValidInitData(validUser, TEST_BOT_TOKEN);

    // Tamper with user payload
    const tamperedInitData = validInitData.replace('123456789', '999999999');
    const result = auth.verifyInitData(tamperedInitData);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid HMAC signature');
  });

  it('should reject initData with invalid or forged hash', () => {
    const validUser = { id: 123456789, first_name: 'Pavel' };
    const validInitData = generateValidInitData(validUser, TEST_BOT_TOKEN);

    // Replace hash with arbitrary string
    const forgedInitData = validInitData.replace(/hash=[a-f0-9]+/, 'hash=badhash1234567890abcdef');
    const result = auth.verifyInitData(forgedInitData);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid HMAC signature');
  });

  it('should reject initData when hash parameter is missing', () => {
    const result = auth.verifyInitData('user=%7B%22id%22%3A123%7D&auth_date=1600000000');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing hash');
  });

  it('should reject empty or null initData', () => {
    expect(auth.verifyInitData('').valid).toBe(false);
    expect(auth.verifyInitData(null as any).valid).toBe(false);
  });

  it('should reject unsigned demo initData even when the demo token is configured', () => {
    const demoAuth = new TelegramAuth('DEMO_BOT_TOKEN');
    const demoInitData = `auth_date=${Math.floor(Date.now() / 1000)}&user=%7B%22id%22%3A555%2C%22first_name%22%3A%22Demo%22%7D&hash=dummyhash`;
    const result = demoAuth.verifyInitData(demoInitData);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid HMAC signature');
  });

  it('should accept signed initData within the 24-hour default window', () => {
    const freshInitData = generateValidInitData(
      { id: 123456789, first_name: 'Pavel' },
      TEST_BOT_TOKEN,
      Math.floor(Date.now() / 1000) - 3600, // 1 hour old
    );

    const result = auth.verifyInitData(freshInitData);
    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(123456789);
  });

  it('should reject stale signed initData older than 24 hours or custom TTL', () => {
    const staleInitData = generateValidInitData(
      { id: 123456789, first_name: 'Pavel' },
      TEST_BOT_TOKEN,
      Math.floor(Date.now() / 1000) - 90000, // > 24 hours old
    );

    const result = auth.verifyInitData(staleInitData);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');

    // Also verify explicit custom TTL option
    const oneHourOld = generateValidInitData(
      { id: 123456789, first_name: 'Pavel' },
      TEST_BOT_TOKEN,
      Math.floor(Date.now() / 1000) - 3600,
    );
    const customExpired = auth.verifyInitData(oneHourOld, { maxAuthAgeSeconds: 300 });
    expect(customExpired.valid).toBe(false);
    expect(customExpired.error).toContain('expired');
  });

  it('should strip Telegram Ed25519 signature parameter without breaking HMAC validation', () => {
    const validUser = { id: 123456789, first_name: 'Pavel', username: 'durov' };
    const validInitData = generateValidInitData(validUser, TEST_BOT_TOKEN);

    // Append Telegram's third-party signature parameter
    const withSignature = `${validInitData}&signature=dummy_ed25519_signature_from_telegram_client_abcdef123456`;
    const result = auth.verifyInitData(withSignature);

    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(123456789);
  });

  it('should normalize missing or empty first_name to username or fallback without failing verification', () => {
    const userWithoutFirstName = { id: 777000, first_name: '   ', username: 'cool_gamer' };
    const initData = generateValidInitData(userWithoutFirstName, TEST_BOT_TOKEN);

    const result = auth.verifyInitData(initData);
    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(777000);
    expect(result.user?.first_name).toBe('cool_gamer');
  });

  it('should allow forward clock drift up to 120 seconds and reject beyond 120s', () => {
    const now = Math.floor(Date.now() / 1000);

    // 60s in future (within 120s tolerance)
    const tolerable = generateValidInitData(
      { id: 123456789, first_name: 'FutureMan' },
      TEST_BOT_TOKEN,
      now + 60,
    );
    expect(auth.verifyInitData(tolerable).valid).toBe(true);

    // 150s in future (exceeds 120s tolerance)
    const tooFarFuture = generateValidInitData(
      { id: 123456789, first_name: 'FarFutureMan' },
      TEST_BOT_TOKEN,
      now + 150,
    );
    const futureResult = auth.verifyInitData(tooFarFuture);
    expect(futureResult.valid).toBe(false);
    expect(futureResult.error).toContain('expired');
  });

  it('should reject replay of the same signed initData payload when consumeReplay is true', () => {
    const initData = generateValidInitData(
      { id: 123456790, first_name: 'Replayable' },
      TEST_BOT_TOKEN,
    );

    expect(auth.verifyInitData(initData).valid).toBe(true);
    const replay = auth.verifyInitData(initData);

    expect(replay.valid).toBe(false);
    expect(replay.error).toContain('replayed');
  });

  it('should allow multiple verifications when consumeReplay is false', () => {
    const initData = generateValidInitData(
      { id: 123456791, first_name: 'MultiAuth' },
      TEST_BOT_TOKEN,
    );

    expect(auth.verifyInitData(initData, { consumeReplay: false }).valid).toBe(true);
    expect(auth.verifyInitData(initData, { consumeReplay: false }).valid).toBe(true);
  });
});
