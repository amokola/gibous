import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessageSchema, GameType } from '../shared';
import { RoomManager } from './roomManager';
import { connectionManager } from './connectionManager';
import { sessionManager } from './sessionManager';
import { runMigrations } from './db/migrate';
import { StorageService } from './storage';
import { TelegramAuth } from './auth';
import { MatchmakingQueue, QueuedPlayer } from './matchmaking';
import { MAX_STAKE, MIN_STAKE } from '../shared/constants/economics';
import { DepositVerificationService } from './tonVerifier';
import { validateMainnetTonConfig } from './tonConfig';
import { renderBragCard } from './bragCardRenderer';
import { createBragShareToken, dateFromBragShareKey, verifyBragShareToken } from './bragShareToken';
import { TelegramBragService } from './telegramBrag';
import { logEvent, metrics } from './observability';
import { roomCommandQueue } from './roomCommandQueue';
import { SettlementWorker } from './settlementWorker';
import { validateStake } from './authGuards';

export const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
const ALLOWED_WS_ORIGINS = new Set(CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean));
const ALLOW_ANY_WS_ORIGIN = ALLOWED_WS_ORIGINS.has('*') && process.env.NODE_ENV !== 'production';
const WS_AUTH_TIMEOUT_MS = 10_000;

function isAllowedWebSocketOrigin(origin?: string): boolean {
  if (!origin) return true;
  return ALLOW_ANY_WS_ORIGIN || ALLOWED_WS_ORIGINS.has(origin);
}

process.on('uncaughtException', (err) => {
  console.error('❌ Server Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exitCode = 1;
    void shutdown('uncaughtException');
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ Server Unhandled Rejection:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exitCode = 1;
    void shutdown('unhandledRejection');
  }
});

// Middlewares - Support dynamic multi-origin CORS
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOW_ANY_WS_ORIGIN || ALLOWED_WS_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin denied'));
    },
  })
);
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  const supplied = req.header('x-request-id');
  const requestId = supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-ID', requestId);
  res.once('finish', () => {
    logEvent('info', 'http.request.completed', {
      requestId,
      method: req.method,
      status: res.statusCode,
    });
  });
  next();
});

// Services
export const roomManager = new RoomManager();
export const storage = new StorageService();
export const settlementWorker = new SettlementWorker(roomManager, storage);
export const depositVerificationService = new DepositVerificationService(storage);
export const auth = new TelegramAuth();
export const telegramBragService = new TelegramBragService();

connectionManager.setLifecycleListener({
  onDisconnected: (conn) => {
    void roomManager.handleDisconnect(conn.telegramId).catch((error) => {
      console.error('Could not process WebSocket disconnect in lifecycle listener:', error);
    });
    broadcastOpenRooms();
  },
});

export const matchmakingQueue = new MatchmakingQueue(async (reservation) => {
  const { p1, p2, gameType, stake, matchId } = reservation;

  const createRes = await roomManager.createRoom(
    undefined,
    gameType,
    stake,
    p1.telegramId,
    p1.name,
    p1.avatarUrl
  );

  if (!createRes.room) {
    throw new Error(createRes.error || 'Failed to create room during matchmaking');
  }

  const roomCode = createRes.room.code;
  logEvent('info', 'matchmaking.room.creating', { matchId, roomCode, p1: p1.telegramId, p2: p2.telegramId, stake });

  const joinRes = await roomManager.joinRoom(
    roomCode,
    p2.telegramId,
    p2.name,
    p2.avatarUrl
  );

  if (!joinRes.room) {
    // Rollback created room and refund Player 1
    await roomManager.deleteRoom(roomCode, p1.telegramId);
    throw new Error(joinRes.error || 'Failed to join room during matchmaking');
  }

  if (p1.ws && p1.ws.readyState === WebSocket.OPEN) sessionManager.attachRoom(p1.ws, roomCode, 'p1');
  if (p2.ws && p2.ws.readyState === WebSocket.OPEN) sessionManager.attachRoom(p2.ws, roomCode, 'p2');
  const snapshot = roomManager.getRoomSnapshot(joinRes.room);
  connectionManager.broadcast(joinRes.room, {
    type: 'GAME_START',
    payload: snapshot,
  });
});

let shutdownPromise: Promise<void> | null = null;

export function shutdown(signal = 'shutdown'): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    logEvent('info', 'process.shutdown.started', { signal });
    depositVerificationService.stop();
    await settlementWorker.drain();
    connectionManager.closeAll();

    for (const client of wss.clients) {
      try {
        client.close(1001, 'Server shutting down');
      } catch {
        client.terminate();
      }
    }

    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const forceCloseTimer = setTimeout(() => {
        server.closeAllConnections?.();
        finish();
      }, 5_000);
      server.close(() => {
        clearTimeout(forceCloseTimer);
        finish();
      });
    });

    await storage.close();
    logEvent('info', 'process.shutdown.completed', { signal });
  })();

  return shutdownPromise;
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

// Broadcast open rooms list to all connected clients
function broadcastOpenRooms() {
  const openRooms = roomManager.getOpenRooms();
  const payload = {
    type: 'ROOMS_LIST',
    payload: { rooms: openRooms },
  };
  const raw = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
    }
  });
}

// TON Connect Manifest Endpoint (Public, CORS-enabled for all TON Wallets)
app.get(['/tonconnect-manifest.json', '/api/tonconnect-manifest.json'], (req, res) => {
  const host = req.get('host') || 'gibous.win';
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const origin = `${protocol}://${host}`;
  const resolvedOrigin = origin.includes('localhost') ? 'https://gibous.win' : origin;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    url: resolvedOrigin,
    name: 'Gibous Duel Arena',
    iconUrl: `${resolvedOrigin}/assets/gram_logo.png`,
    termsOfUseUrl: `${resolvedOrigin}/terms.html`,
    privacyPolicyUrl: `${resolvedOrigin}/privacy.html`,
  });
});

// REST Endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/ready', async (_req, res) => {
  const databaseReady = await storage.isReady();
  if (!databaseReady) {
    return res.status(503).json({ status: 'not_ready', checks: { database: 'failed' } });
  }
  return res.json({ status: 'ready', checks: { database: 'ok' } });
});

app.get('/api/metrics', (_req, res) => {
  res.json(metrics.getSnapshot());
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.getOpenRooms() });
});

app.get('/api/leaderboard', async (_req, res) => {
  res.json({ period: 'alltime', players: await storage.getLeaderboard() });
});

app.post('/api/rooms', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'test') {
      return res.status(401).json({ success: false, error: 'Use an authenticated WebSocket session' });
    }
    const { roomCode, gameType, stake, telegramId, playerName, avatarUrl } = req.body;
    let normalizedStake = 100;
    try {
      normalizedStake = validateStake(stake ?? 100);
    } catch {
      return res.status(400).json({ success: false, error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} GRAM` });
    }

    const result = await roomManager.createRoom(
      roomCode,
      gameType || 'snake',
      normalizedStake,
      telegramId || 123456789,
      playerName || 'Player 1',
      avatarUrl
    );

    if (result.error || !result.room) {
      return res.status(400).json({ success: false, error: result.error || 'Failed to create room' });
    }

    broadcastOpenRooms();
    return res.json({ success: true, room: { code: result.room.code, status: result.room.status } });
  } catch (err) {
    console.error('Room creation failed:', err);
    return res.status(500).json({ success: false, error: 'Room creation failed' });
  }
});

app.get('/api/user/:telegramId', async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(401).json({ error: 'Use an authenticated WebSocket session' });
  }
  const tgId = parseInt(req.params.telegramId, 10);
  if (isNaN(tgId)) {
    return res.status(400).json({ error: 'Invalid telegramId' });
  }
  const user = await storage.getOrCreateUser({ id: tgId, first_name: `Player_${tgId}` });
  return res.json({ user });
});

function getPublicAppUrl(req: express.Request): string {
  return (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function getTelegramMiniAppUrl(startParam?: string): string {
  const baseUrl = process.env.TELEGRAM_BOT_APP_URL || `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'gibous_bot'}/${process.env.TELEGRAM_BOT_APP_NAME || 'app'}`;
  return startParam ? `${baseUrl}?startapp=${encodeURIComponent(startParam)}` : baseUrl;
}

function formatBragDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date).toUpperCase();
}

app.post('/api/telegram/brag/prepare', async (req, res) => {
  try {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
    const verification = auth.verifyInitData(initData, { consumeReplay: false });
    if (!verification.valid || !verification.user?.id) {
      return res.status(401).json({ success: false, error: verification.error || 'Telegram authentication required' });
    }

    const telegramUser = verification.user;
    await storage.getOrCreateUser({
      id: telegramUser.id,
      first_name: telegramUser.first_name || `Player_${telegramUser.id}`,
      last_name: telegramUser.last_name,
      username: telegramUser.username,
      photo_url: telegramUser.photo_url,
    });
    const now = new Date();
    const stats = await storage.getDailyBragStats(telegramUser.id, now);
    if (!stats) return res.status(404).json({ success: false, error: 'Gibous account not found' });

    if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_APP_URL) {
      return res.status(503).json({ success: false, error: 'PUBLIC_APP_URL must be configured for Telegram media sharing' });
    }

    const token = createBragShareToken(telegramUser.id, now);
    const imageUrl = `${getPublicAppUrl(req)}/api/telegram/brag/image/${token}.jpg`;
    const challengeUrl = getTelegramMiniAppUrl();
    const prepared = await telegramBragService.preparePhoto(telegramUser.id, { imageUrl, challengeUrl });

    return res.json({
      success: true,
      preparedMessageId: prepared.id,
      expirationDate: prepared.expirationDate,
      imageUrl,
      dateLabel: formatBragDate(now),
      hasMatchesToday: stats.today.matches > 0,
    });
  } catch (error) {
    console.error('Brag preparation failed:', error);
    return res.status(502).json({
      success: false,
      error: 'Could not create brag card. Please try again.',
    });
  }
});

app.get('/api/telegram/brag/image/:token.jpg', async (req, res) => {
  try {
    const verifiedToken = verifyBragShareToken(req.params.token);
    if (!verifiedToken) return res.status(404).send('Not found');

    const stats = await storage.getDailyBragStats(
      verifiedToken.telegramId,
      dateFromBragShareKey(verifiedToken.dateKey),
    );
    if (!stats) return res.status(404).send('Not found');

    const image = await renderBragCard({ ...stats, dateLabel: formatBragDate(dateFromBragShareKey(verifiedToken.dateKey)) });
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(image);
  } catch {
    return res.status(500).send('Unable to render image');
  }
});

/**
 * Telegram Bot Webhook Endpoint
 * Handles incoming bot updates (/start commands, deep links, inline queries)
 */
app.post('/api/telegram/webhook', async (req, res) => {
  res.status(200).send('OK');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const publicAppUrl = process.env.PUBLIC_APP_URL || 'https://gibous.win';
  if (!botToken || botToken === 'DEMO_BOT_TOKEN') return;

  try {
    const { message, inline_query } = req.body || {};

    // 1. Handle incoming text commands (/start, /start ROOMCODE)
    if (message?.text && message?.chat?.id) {
      const text = message.text.trim();
      const chatId = message.chat.id;

      if (text.startsWith('/start')) {
        const richHtml = `<h1>🎲 GIBOUS DUEL ARENA</h1>
<b>Real games. Real stakes. Instant TON payouts.</b>

Drop your chips, roll the dice, or throw hands.
Back your skills with GRAM and take the pot.

<tg-button-row align="center">
  <tg-button type="web_app" url="${publicAppUrl}" style="primary">🎮 Launch Arena & Play</tg-button>
</tg-button-row>

<blockquote expandable>
<b>🕹 GAME MODES</b>

🐍 <b>Snakes & Ladders</b>
&nbsp;&nbsp;&nbsp;▸ <i>100-tile board race with live dice rolls</i>

🔴 <b>Connect 4</b>
&nbsp;&nbsp;&nbsp;▸ <i>7×6 gravity grid • Pure mind games</i>

✂️ <b>Rock Paper Scissors</b>
&nbsp;&nbsp;&nbsp;▸ <i>Best-of-3 blitz • 10-second turns</i>

<b>💰 THE RULES</b>
&nbsp;&nbsp;&nbsp;• <i>Every match is 1v1 with live escrow</i>
&nbsp;&nbsp;&nbsp;• <i>Winner takes pot instantly on TON</i>
&nbsp;&nbsp;&nbsp;• <i>No delays, no middleman holding your funds</i>
</blockquote>

<tg-button-row align="center">
  <tg-button type="switch_inline_query" data="">⚔️ Challenge a Friend</tg-button>
  <tg-button type="url" url="https://t.me/gibous_community">💬 Community & Duels</tg-button>
</tg-button-row>

<code>💡 Tip: Type @gbousbot in any chat to challenge someone instantly.</code>`;

        let sent = false;
        try {
          const richRes = await fetch(`https://api.telegram.org/bot${botToken}/sendRichMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              rich_message: {
                html: richHtml,
              },
            }),
          });
          if (richRes.ok) {
            sent = true;
          }
        } catch {
          sent = false;
        }

        // Fallback to standard sendMessage with inline_keyboard if sendRichMessage is unsupported
        if (!sent) {
          const fallbackText = `🎲 <b>GIBOUS DUEL ARENA</b>\n<b>Real games. Real stakes. Instant TON payouts.</b>\n\nDrop your chips, roll the dice, or throw hands.\nBack your skills with GRAM and take the pot.\n\n<blockquote expandable><b>🕹 GAME MODES</b>\n\n🐍 <b>Snakes & Ladders</b>\n&nbsp;&nbsp;&nbsp;▸ <i>100-tile board race with live dice rolls</i>\n\n🔴 <b>Connect 4</b>\n&nbsp;&nbsp;&nbsp;▸ <i>7×6 gravity grid • Pure mind games</i>\n\n✂️ <b>Rock Paper Scissors</b>\n&nbsp;&nbsp;&nbsp;▸ <i>Best-of-3 blitz • 10-second turns</i>\n\n<b>💰 THE RULES</b>\n&nbsp;&nbsp;&nbsp;• <i>Every match is 1v1 with live escrow</i>\n&nbsp;&nbsp;&nbsp;• <i>Winner takes pot instantly on TON</i>\n&nbsp;&nbsp;&nbsp;• <i>No delays, no middleman holding your funds</i></blockquote>\n\n<code>💡 Tip: Type @gbousbot in any chat to challenge someone instantly.</code>`;

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: fallbackText,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '🎮 Launch Arena & Play',
                      web_app: { url: publicAppUrl },
                    },
                  ],
                  [
                    {
                      text: '⚔️ Challenge a Friend',
                      switch_inline_query: '',
                    },
                    {
                      text: '💬 Community & Duels',
                      url: 'https://t.me/gibous_community',
                    },
                  ],
                ],
              },
            }),
          });
        }
      }
    }

    // 2. Handle inline queries (@gbousbot ...)
    if (inline_query?.id) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerInlineQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inline_query_id: inline_query.id,
          results: [
            {
              type: 'article',
              id: 'gibous-challenge',
              title: '⚔️ Challenge to a Duel on Gibous',
              description: 'Play Snakes & Ladders, Four in a Row, or Rock Paper Scissors',
              input_message_content: {
                message_text: `⚔️ <b>Duel Challenge on Gibous!</b>\n\nI challenge you to a real-time PvP duel!\nTap below to launch the arena and play:`,
                parse_mode: 'HTML',
              },
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '🎮 Accept Challenge',
                      web_app: { url: publicAppUrl },
                    },
                  ],
                ],
              },
            },
          ],
          cache_time: 10,
        }),
      });
    }
  } catch (webhookErr) {
      console.error('Error handling Telegram webhook update:', webhookErr);
  }
});

// Serve static client build in production
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/ws') ||
      req.path.startsWith('/tonconnect-manifest.json')
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Create HTTP & WebSocket server with explicit HTTP upgrade handling
export const server = createServer(app);
export const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
});

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  const clientIp = req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!isAllowedWebSocketOrigin(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!connectionManager.canAcceptConnection(clientIp)) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function sendError(ws: WebSocket, code: string, message: string, requestId?: string) {
  logEvent('warn', 'ws.command.rejected', { requestId, code });
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        requestId,
        payload: { code, message },
      })
    );
  }
}

// WebSocket Connection Handling
wss.on('connection', (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress || 'unknown';
  connectionManager.trackSocketIp(ws, clientIp);

  ws.on('pong', () => {
    connectionManager.markHeartbeatAlive(ws);
  });

  const authTimeout = setTimeout(() => {
    if (!sessionManager.getSession(ws) && ws.readyState === WebSocket.OPEN) {
      sendError(ws, 'AUTH_TIMEOUT', 'Authentication timeout. Please reconnect.');
      ws.close(1008, 'Authentication timeout');
    }
  }, WS_AUTH_TIMEOUT_MS);
  if (authTimeout && typeof authTimeout === 'object' && 'unref' in authTimeout) {
    (authTimeout as any).unref();
  }

  const processMessage = async (data: string) => {
    connectionManager.touchConnection(ws);

    if (!connectionManager.checkTransportRateLimit(ws)) {
      sendError(ws, 'RATE_LIMIT_EXCEEDED', "You're moving too quickly. Please wait a moment.");
      return;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(data.toString());
    } catch {
      sendError(ws, 'INVALID_JSON', 'Something went wrong. Please try again.');
      return;
    }

    const parseResult = ClientMessageSchema.safeParse(rawJson);
    if (!parseResult.success) {
      sendError(ws, 'SCHEMA_VALIDATION_ERROR', 'Something went wrong. Please try again.');
      return;
    }

    const message = parseResult.data;
    const requestId = message.requestId || randomUUID();
    const authenticatedSession = sessionManager.getSession(ws);
    const authenticated = Boolean(authenticatedSession);
    if (message.type !== 'PING') {
      const roomCode = (message.payload as { roomCode?: unknown })?.roomCode;
      logEvent('info', 'ws.command.received', {
        requestId,
        command: message.type,
        roomCode: typeof roomCode === 'string' ? roomCode.toUpperCase() : undefined,
        actorId: authenticatedSession?.telegramId,
        authenticated,
      });
    }
    if (!authenticated && message.type !== 'AUTH' && message.type !== 'PING') {
      sendError(ws, 'UNAUTHORIZED', 'Please log in to continue.', requestId);
      return;
    }

    try {
      switch (message.type) {
        // --- 1. HEARTBEAT ---
        case 'PING': {
          ws.send(
            JSON.stringify({
              type: 'PONG',
              requestId,
              payload: {
                timestamp: Date.now(),
                clientTimestamp: message.payload.timestamp,
              },
            })
          );
          break;
        }

        // --- 2. AUTHENTICATION ---
        case 'AUTH': {
          const { telegramId, playerName, avatarUrl, initData } = message.payload;

          if (initData) {
            const verification = auth.verifyInitData(initData, { consumeReplay: false });
            let verifiedId = telegramId;
            let verifiedName = playerName;
            let verifiedUsername: string | undefined;
            let verifiedPhoto = avatarUrl;

            if (!verification.valid) {
              if (
                process.env.NODE_ENV !== 'test' &&
                process.env.ALLOW_UNSIGNED_AUTH === 'true' &&
                process.env.NODE_ENV !== 'production'
              ) {
                console.warn('⚠️ [AUTH] InitData verification failed, but allowing dev access (ALLOW_UNSIGNED_AUTH=true):', {
                  telegramId,
                  playerName,
                  error: verification.error,
                });
                try {
                  const candidateParams = new URLSearchParams(initData.trim().replace(/^[?#]/, ''));
                  const rawUserStr = candidateParams.get('user');
                  if (rawUserStr) {
                    const parsed = JSON.parse(rawUserStr);
                    if (parsed?.id) verifiedId = parsed.id;
                    if (parsed?.first_name) verifiedName = parsed.first_name;
                    if (parsed?.username) verifiedUsername = parsed.username;
                    if (parsed?.photo_url) verifiedPhoto = parsed.photo_url;
                  }
                } catch {
                  // Fallback to payload fields
                }
              } else {
                console.warn('❌ Auth verification failed:', {
                  telegramId,
                  playerName,
                  error: verification.error,
                  initDataPrefix: initData.slice(0, 100),
                });
                clearTimeout(authTimeout);
                sendError(ws, 'AUTH_FAILED', verification.error || "We couldn't verify your Telegram account. Please try again.", requestId);
                ws.close(1008, verification.error || 'Authentication failed');
                break;
              }
            } else {
              verifiedId = verification.user?.id ?? telegramId;
              verifiedName = verification.user?.first_name || playerName;
              verifiedUsername = verification.user?.username;
              verifiedPhoto = verification.user?.photo_url || avatarUrl;
            }

            await storage.getOrCreateUser({ id: verifiedId, first_name: verifiedName, username: verifiedUsername, photo_url: verifiedPhoto });
            const user = await storage.getAccountSnapshot(verifiedId);
            const connectionId = connectionManager.registerConnection(verifiedId, ws);
            sessionManager.register(ws, verifiedId, verifiedName, verifiedPhoto, connectionId);
            clearTimeout(authTimeout);

            ws.send(
              JSON.stringify({
                type: 'AUTH_OK',
                requestId,
                payload: { telegramId: verifiedId, user },
              })
            );
            break;
          }

          // Standalone / demo fallback
          if (
            process.env.NODE_ENV === 'production' ||
            process.env.ALLOW_UNSIGNED_AUTH !== 'true'
          ) {
            clearTimeout(authTimeout);
            sendError(ws, 'AUTH_FAILED', 'Please open the app from Telegram.', requestId);
            ws.close(1008, 'Please open the app from Telegram.');
            break;
          }
          await storage.getOrCreateUser({ id: telegramId, first_name: playerName, photo_url: avatarUrl });
          const user = await storage.getAccountSnapshot(telegramId);
          const connectionId = connectionManager.registerConnection(telegramId, ws);
          sessionManager.register(ws, telegramId, playerName, avatarUrl, connectionId);
          clearTimeout(authTimeout);

          ws.send(
            JSON.stringify({
              type: 'AUTH_OK',
              requestId,
              payload: { telegramId, user },
            })
          );
          break;
        }

        // --- 3. ROOM CREATION & JOINING ---
        case 'CREATE_ROOM': {
          const { roomCode, gameType, stake, telegramId } = message.payload;
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in to create a room.', requestId);
            break;
          }
          if (telegramId !== undefined && telegramId !== session.telegramId) {
            sendError(ws, 'UNAUTHORIZED', "We couldn't verify your account. Please try again.", requestId);
            break;
          }

          let normalizedStake = 100;
          try {
            normalizedStake = validateStake(stake ?? 100);
          } catch {
            sendError(ws, 'INVALID_STAKE', `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} GRAM`, requestId);
            break;
          }

          connectionManager.registerConnection(session.telegramId, ws);

          const result = await roomManager.createRoom(
            roomCode,
            (gameType || 'snake') as GameType,
            normalizedStake,
            session.telegramId,
            session.name,
            session.avatarUrl
          );

          if (result.error || !result.room) {
            sendError(ws, 'CREATE_FAILED', result.error || 'Failed to create room', requestId);
            break;
          }

          const code = result.room.code;
          sessionManager.attachRoom(ws, code, 'p1');
          broadcastOpenRooms();

          const snapshot = roomManager.getRoomSnapshot(result.room);
          ws.send(
            JSON.stringify({
              type: 'ROOM_CREATED',
              requestId,
              payload: snapshot,
            })
          );
          break;
        }

        case 'CANCEL_ROOM': {
          const { roomCode } = message.payload;
          const code = roomCode.toUpperCase();
          const session = sessionManager.getSession(ws);

          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in to continue.', requestId);
            break;
          }

          await roomCommandQueue.withRoomLock(code, async () => {
            const deleted = await roomManager.deleteRoom(code, session.telegramId);
            if (deleted) {
              sessionManager.detachRoom(ws);
              broadcastOpenRooms();
              ws.send(
                JSON.stringify({
                  type: 'ROOM_CANCELLED',
                  requestId,
                  payload: { roomCode: code },
                })
              );
            } else {
              sendError(ws, 'CANCEL_FAILED', 'Cannot cancel room: already started or not found', requestId);
            }
          });
          break;
        }

        case 'CREATE_DEPOSIT_INTENT': {
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in before creating a deposit intent.', requestId);
            break;
          }

          const configuredVault = process.env.TON_DEPOSIT_ADDRESS || process.env.VITE_SYSTEM_DEPOSIT_ADDRESS;
          const configuredNetwork = (process.env.TON_NETWORK || 'mainnet') as 'mainnet' | 'testnet';
          if (!configuredVault || configuredVault.includes('GIBOUS_VAULT')) {
            sendError(ws, 'DEPOSIT_UNAVAILABLE', 'Deposits are temporarily unavailable.', requestId);
            break;
          }

          try {
            const intent = await storage.createDepositIntent({
              telegramId: session.telegramId,
              amountNano: message.payload.amountNano,
              walletAddress: message.payload.walletAddress,
              depositAddress: configuredVault,
              network: configuredNetwork,
            });

            console.log(`[DEPOSIT_INTENT] Created intent ${intent.id} with memo ${intent.memo} for user tg:${session.telegramId}`);

            ws.send(JSON.stringify({
              type: 'DEPOSIT_INTENT_CREATED',
              requestId,
              payload: {
                intentId: intent.id,
                memo: intent.memo,
                depositAddress: intent.deposit_address,
                amountNano: String(intent.amount_nano),
                expiresAt: new Date(intent.expires_at).toISOString(),
              },
            }));
          } catch (err: any) {
            sendError(ws, 'DEPOSIT_INTENT_FAILED', err?.message || 'Failed to create deposit intent', requestId);
          }
          break;
        }

        case 'CANCEL_DEPOSIT_INTENT': {
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in before cancelling a deposit intent.', requestId);
            break;
          }

          try {
            const result = await storage.cancelDepositIntent(message.payload.intentId, session.telegramId);
            if (!result.success) {
              sendError(ws, 'CANCEL_DEPOSIT_INTENT_FAILED', result.error || 'Failed to cancel deposit intent', requestId);
              break;
            }

            console.log(`[DEPOSIT_INTENT] Cancelled intent ${message.payload.intentId} for user tg:${session.telegramId}`);

            ws.send(JSON.stringify({
              type: 'DEPOSIT_INTENT_CANCELLED',
              requestId,
              payload: { intentId: message.payload.intentId },
            }));
          } catch (err: any) {
            sendError(ws, 'CANCEL_DEPOSIT_INTENT_FAILED', err?.message || 'Failed to cancel deposit intent', requestId);
          }
          break;
        }

        case 'SUBMIT_DEPOSIT': {
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in before making a deposit.', requestId);
            break;
          }

          const result = await storage.recordPendingDeposit({
            intentId: message.payload.intentId,
            telegramId: session.telegramId,
            walletAddress: message.payload.walletAddress,
            depositAddress: message.payload.depositAddress,
            amountNano: message.payload.amountNano,
            boc: message.payload.boc,
            network: message.payload.network,
          });

          if (!result.success) {
            sendError(ws, 'DEPOSIT_REJECTED', result.error, requestId);
            break;
          }

          console.log(`[DEPOSIT_BOC] Submitted BOC for intent ${result.transaction.id} by tg:${session.telegramId}`);

          ws.send(JSON.stringify({
            type: 'TRANSACTION_PENDING',
            requestId,
            payload: result.transaction,
          }));
          break;
        }

        case 'SUBMIT_WITHDRAWAL': {
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in before requesting a withdrawal.', requestId);
            break;
          }

          const result = await storage.requestWithdrawal({
            telegramId: session.telegramId,
            walletAddress: message.payload.walletAddress,
            amountNano: message.payload.amountNano,
          });

          if (!result.success) {
            sendError(ws, 'WITHDRAWAL_REJECTED', result.error, requestId);
            break;
          }

          connectionManager.sendToPlayer(session.telegramId, {
            type: 'ACCOUNT_UPDATED',
            payload: {
              balanceGram: result.user.balance_gram,
              balanceNano: result.user.balance_nano,
              user: result.user,
            },
          });

          ws.send(JSON.stringify({
            type: 'TRANSACTION_CONFIRMED',
            requestId,
            payload: result.transaction,
          }));
          break;
        }

        case 'JOIN_ROOM': {
          const { roomCode, telegramId } = message.payload;
          const code = roomCode.toUpperCase();
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in to join a room.', requestId);
            break;
          }
          if (telegramId !== undefined && telegramId !== session.telegramId) {
            sendError(ws, 'UNAUTHORIZED', "We couldn't verify your account. Please try again.", requestId);
            break;
          }
          connectionManager.registerConnection(session.telegramId, ws);

          await roomCommandQueue.withRoomLock(code, async () => {
            // Check if rejoining an existing match
            const reconnectResult = await roomManager.reconnectPlayer(code, session.telegramId);
            if (reconnectResult.room && reconnectResult.role) {
              sessionManager.attachRoom(ws, code, reconnectResult.role);
              const snapshot = roomManager.getRoomSnapshot(reconnectResult.room);
              ws.send(
                JSON.stringify({
                  type: 'ROOM_STATE',
                  requestId,
                  payload: snapshot,
                })
              );
              return;
            }

            // Join room as new Player 2
            const result = await roomManager.joinRoom(code, session.telegramId, session.name, session.avatarUrl);
            if (result.error || !result.room) {
              sendError(ws, 'JOIN_FAILED', result.error || 'Failed to join room', requestId);
              return;
            }

            sessionManager.attachRoom(ws, code, 'p2');
            broadcastOpenRooms();
            const snapshot = roomManager.getRoomSnapshot(result.room);
            connectionManager.broadcast(result.room, {
              type: 'GAME_START',
              requestId,
              payload: snapshot,
            });
          });
          break;
        }

        case 'SYNC_ROOM': {
          const code = message.payload.roomCode.toUpperCase();
          const room = roomManager.getRoom(code);
          if (!room) {
            sendError(ws, 'ROOM_NOT_FOUND', 'Duel room not found', requestId);
            break;
          }

          const session = sessionManager.getSession(ws);
          const isMember = Boolean(
            session && (room.p1?.telegramId === session.telegramId || room.p2?.telegramId === session.telegramId)
          );
          if (!isMember) {
            sendError(ws, 'UNAUTHORIZED', 'You are not in this duel', requestId);
            break;
          }

          const snapshot = roomManager.getRoomSnapshot(room);
          ws.send(
            JSON.stringify({
              type: 'ROOM_STATE',
              requestId,
              payload: snapshot,
            })
          );
          break;
        }

        case 'LEAVE_ROOM': {
          const code = message.payload.roomCode.toUpperCase();
          const session = sessionManager.getSession(ws);
          if (session) {
            await roomCommandQueue.withRoomLock(code, async () => {
              await roomManager.handleLeaveRoom(code, session.telegramId);
            });
          }
          sessionManager.detachRoom(ws);
          broadcastOpenRooms();
          break;
        }

        case 'GET_ROOMS': {
          ws.send(
            JSON.stringify({
              type: 'ROOMS_LIST',
              requestId,
              payload: { rooms: roomManager.getOpenRooms() },
            })
          );
          break;
        }

        // --- 4. GAMEPLAY ACTIONS (Server-Authoritative with Strict Serialization & Atomic Commit) ---
        case 'ROLL_DICE':
        case 'DROP_DISC':
        case 'CHOOSE_RPS': {
          if (!connectionManager.checkActionRateLimit(ws)) {
            sendError(ws, 'ACTION_RATE_LIMITED', "You're moving too quickly. Please wait a moment.", requestId);
            break;
          }

          const code = message.payload.roomCode.toUpperCase();
          const session = sessionManager.getSession(ws);

          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in to continue.', requestId);
            break;
          }

          await roomCommandQueue.withRoomLock(code, async () => {
            const room = roomManager.getRoom(code);
            if (!room) {
              sendError(ws, 'ROOM_NOT_FOUND', 'Duel not found', requestId);
              return;
            }

            let playerRole: 'p1' | 'p2' | null = null;
            if (room.p1 && room.p1.telegramId === session.telegramId) {
              playerRole = 'p1';
            } else if (room.p2 && room.p2.telegramId === session.telegramId) {
              playerRole = 'p2';
            }

            if (!playerRole) {
              sendError(ws, 'UNAUTHORIZED', 'You are not an active player in this duel', requestId);
              return;
            }

            // Pure state transition calculation (does not mutate in-memory room)
            const transition = roomManager.calculateAction(code, playerRole, message.type, message.payload, requestId);
            if (!transition.success) {
              sendError(ws, 'ACTION_REJECTED', transition.error || 'Invalid move', requestId);
              return;
            }

            // Persist transition atomically to database before committing memory
            if (!transition.isCached) {
              try {
                await roomManager.persistActionTransition(code, transition);
              } catch (error) {
                console.error(`Could not persist action for room ${code}:`, error);
                sendError(ws, 'STATE_PERSISTENCE_FAILED', 'Could not record move. Please try again.', requestId);
                return;
              }
            }

            // Commit transition to in-memory authoritative state
            const result = roomManager.commitTransition(code, transition);

            // Broadcast move event
            connectionManager.broadcast(room, {
              type: result.actionType,
              requestId,
              payload: {
                ...result.payload,
                roomCode: code,
                version: room.version,
              },
            });

            // If game ended, enqueue decoupled settlement job
            if (transition.isGameOver && transition.winner) {
              await settlementWorker.enqueueSettlement(code, requestId);
            }
          });
          break;
        }

        // --- 5. REMATCH ---
        case 'REMATCH_REQUEST': {
          const code = message.payload.roomCode.toUpperCase();
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in to continue.', requestId);
            break;
          }

          await roomCommandQueue.withRoomLock(code, async () => {
            const rematchRes = await roomManager.handleRematchVote(code, session.telegramId);
            if (rematchRes.bothReady && rematchRes.room) {
              const newCode = rematchRes.room.code;
              const p1Conn = rematchRes.room.p1 ? connectionManager.getConnection(rematchRes.room.p1.telegramId) : undefined;
              const p2Conn = rematchRes.room.p2 ? connectionManager.getConnection(rematchRes.room.p2.telegramId) : undefined;
              if (p1Conn?.ws) sessionManager.attachRoom(p1Conn.ws, newCode, 'p1');
              if (p2Conn?.ws) sessionManager.attachRoom(p2Conn.ws, newCode, 'p2');

              const snapshot = roomManager.getRoomSnapshot(rematchRes.room);
              connectionManager.broadcast(rematchRes.room, {
                type: 'GAME_START',
                requestId,
                payload: snapshot,
              });
            } else if (rematchRes.room) {
              connectionManager.broadcast(rematchRes.room, {
                type: 'ROOM_STATE',
                requestId,
                payload: roomManager.getRoomSnapshot(rematchRes.room),
              });
            }
          });
          break;
        }

        // --- 6. EMOTES ---
        case 'EMOTE': {
          if (!connectionManager.checkEmoteRateLimit(ws)) {
            sendError(ws, 'ACTION_RATE_LIMITED', "You're moving too quickly. Please wait a moment.", requestId);
            break;
          }

          const code = message.payload.roomCode.toUpperCase();
          const room = roomManager.getRoom(code);
          const session = sessionManager.getSession(ws);

          if (!room || !session) break;
          const playerRole: 'p1' | 'p2' | null =
            room.p1?.telegramId === session.telegramId ? 'p1' :
            room.p2?.telegramId === session.telegramId ? 'p2' : null;

          if (playerRole) {
            connectionManager.broadcast(room, {
              type: 'EMOTE',
              requestId,
              payload: {
                player: playerRole,
                emoji: message.payload.emoji,
              },
            });
          }
          break;
        }

        // --- 7. MATCHMAKING QUEUE ---
        case 'JOIN_QUEUE': {
          const { gameType, stake, telegramId, playerName } = message.payload;
          const session = sessionManager.getSession(ws);
          if (!session) {
            sendError(ws, 'UNAUTHORIZED', 'Please log in to join matchmaking.', requestId);
            break;
          }
          if (telegramId !== undefined && telegramId !== session.telegramId) {
            sendError(ws, 'UNAUTHORIZED', "We couldn't verify your account. Please try again.", requestId);
            break;
          }

          let validatedStake = 100;
          try {
            validatedStake = validateStake(stake ?? 100);
          } catch {
            sendError(ws, 'INVALID_STAKE', `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} GRAM`, requestId);
            break;
          }

          try {
            const queueResult = await matchmakingQueue.enqueue({
              telegramId: session.telegramId,
              name: playerName || session.name || 'Player',
              avatarUrl: session.avatarUrl,
              gameType: (gameType || 'snake') as GameType,
              stake: validatedStake,
              joinedAt: Date.now(),
              ws,
            });

            ws.send(
              JSON.stringify({
                type: 'QUEUE_JOINED',
                requestId,
                payload: { status: queueResult.status },
              })
            );
          } catch (error) {
            console.error('Matchmaking enqueue failed:', error);
            sendError(ws, 'MATCHMAKING_FAILED', 'Could not join matchmaking. Please try again.', requestId);
          }
          break;
        }

        case 'CANCEL_QUEUE': {
          const session = sessionManager.getSession(ws);
          if (session) {
            matchmakingQueue.dequeueByPlayer(session.telegramId);
          } else {
            matchmakingQueue.dequeue(ws);
          }
          ws.send(
            JSON.stringify({
              type: 'QUEUE_CANCELLED',
              requestId,
              payload: { status: 'cancelled' },
            })
          );
          break;
        }

        default:
          break;
      }
    } catch (err: any) {
      console.error(`❌ WebSocket message processing error [${message?.type}]:`, err);
      sendError(ws, 'INTERNAL_SERVER_ERROR', 'Something went wrong. Please try again.', requestId);
    }
  };

  let messageChain: Promise<void> = Promise.resolve();
  ws.on('message', (data) => {
    messageChain = messageChain
      .then(() => processMessage(data.toString()))
      .catch((error) => {
        console.error('❌ WebSocket command queue error:', error);
        sendError(ws, 'INTERNAL_SERVER_ERROR', 'Request could not be processed');
      });
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    const session = sessionManager.getSession(ws);
    if (session) {
      matchmakingQueue.dequeueByPlayer(session.telegramId);
      connectionManager.removeConnection(ws, session.connectionId, 'client_close');
      sessionManager.remove(ws);
      broadcastOpenRooms();
    } else {
      matchmakingQueue.dequeue(ws);
      connectionManager.removeConnection(ws, undefined, 'client_close');
    }
  });

  ws.on('error', (err) => {
    console.error(`⚠️ WebSocket error from ${clientIp}:`, err.message);
  });
});

// Start listening only when not in automated test runner
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  if (process.env.NODE_ENV === 'production') {
    const missingProductionConfig = [
      ['DATABASE_URL', process.env.DATABASE_URL],
      ['TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'DEMO_BOT_TOKEN' ? 'configured' : ''],
      ['CORS_ORIGIN', CORS_ORIGIN && CORS_ORIGIN !== '*' ? CORS_ORIGIN : ''],
    ].filter(([, value]) => !value).map(([name]) => name);
    missingProductionConfig.push(...validateMainnetTonConfig());
    if (process.env.ALLOW_UNSIGNED_AUTH === 'true') missingProductionConfig.push('ALLOW_UNSIGNED_AUTH=false');
    if (process.env.E2E_TEST_MODE === 'true') missingProductionConfig.push('E2E_TEST_MODE=false');
    if (missingProductionConfig.length > 0) {
      throw new Error(`Refusing to start production server with missing/unsafe configuration: ${missingProductionConfig.join(', ')}`);
    }
  }

  const startServer = async () => {
    if (process.env.DATABASE_URL) {
      try {
        await runMigrations(process.env.DATABASE_URL);
      } catch (migrationError) {
        console.error('Database migration check failed on startup:', migrationError);
        if (process.env.NODE_ENV === 'production') throw migrationError;
      }
    }
    await roomManager.restorePersistedRooms();
    await settlementWorker.reconcileInterruptedSettlements();
    server.listen(PORT, () => {
      console.log(`
  🎲 GIBOUS DUEL ARENA MULTIPLAYER SERVER
  ───────────────────────────────────────
  🚀 HTTP Server running on: http://127.0.0.1:${PORT}
  🔌 WebSocket endpoint at: ws://127.0.0.1:${PORT}/ws
  🛡️  Authoritative Engines: Snake & Ladder, Connect 4, RPS
  💰 Escrow Staking & Treasury active
  ───────────────────────────────────────
    `);

      if (process.env.NODE_ENV !== 'test') {
        depositVerificationService.start();
      }

      // Register Telegram Webhook if public app URL and bot token are available
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const publicAppUrl = process.env.PUBLIC_APP_URL;
      if (botToken && botToken !== 'DEMO_BOT_TOKEN' && publicAppUrl && publicAppUrl.startsWith('https://')) {
        const webhookUrl = `${publicAppUrl}/api/telegram/webhook`;
        fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
          .then((r) => r.json())
          .then((res: any) => {
            if (res?.ok) {
              console.log(`  🤖 Telegram Webhook registered: ${webhookUrl}`);
            } else {
              console.warn(`  ⚠️ Telegram Webhook registration:`, res?.description || res);
            }
          })
          .catch((err) => {
            console.warn(`  ⚠️ Could not register Telegram webhook:`, err.message);
          });
      }
    });
  };

  void startServer().catch((error) => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  });
}
