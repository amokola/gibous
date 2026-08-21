import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { MatchmakingQueue, QueuedPlayer } from './matchmaking';
import { StorageService } from './storage';
import { TelegramAuth } from './auth';
import { sessionManager } from './sessionManager';
import { connectionManager } from './connectionManager';
import { ClientMessageSchema, PlayerRole } from '../shared';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const roomManager = new RoomManager();
const storage = new StorageService();
const auth = new TelegramAuth();

// Initialize Matchmaking Queue
const matchmakingQueue = new MatchmakingQueue((p1: QueuedPlayer, p2: QueuedPlayer, gameType: string, stake: number) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = roomManager.createRoom(roomCode, gameType as any, stake, p1.telegramId, p1.name, p1.avatarUrl);
  roomManager.joinRoom(roomCode, p2.telegramId, p2.name, p2.avatarUrl);

  if (p1.ws) sessionManager.attachRoom(p1.ws, roomCode, 'p1');
  if (p2.ws) sessionManager.attachRoom(p2.ws, roomCode, 'p2');

  const snapshot = roomManager.getRoomSnapshot(room);
  connectionManager.broadcast(room, {
    type: 'GAME_START',
    payload: snapshot,
  });
});

// REST Endpoints
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), protocol: 'gibous-v1' });
});

app.get('/api/user/:tgId', async (req, res) => {
  const tgId = Number(req.params.tgId);
  const user = await storage.getOrCreateUser({ id: tgId, first_name: 'Player' });
  res.json(user);
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.getOpenRooms() });
});

app.post('/api/rooms', (req, res) => {
  const { roomCode, gameType, stake, telegramId, playerName, avatarUrl } = req.body;
  const code = (roomCode || Math.random().toString(36).substring(2, 8)).toUpperCase();
  const room = roomManager.createRoom(
    code,
    gameType || 'snake',
    stake || 100,
    telegramId || 123456789,
    playerName || 'Player 1',
    avatarUrl
  );
  broadcastOpenRooms();
  res.json({ success: true, room: { code: room.code, status: room.status } });
});

app.delete('/api/rooms/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const deleted = roomManager.deleteRoom(code);
  broadcastOpenRooms();
  res.json({ success: deleted });
});

app.get('/api/treasury', async (_req, res) => {
  res.json({
    totalRakeCollected: 840,
    winRake10Percent: 780,
    drawFees5Percent: 60,
    totalVolume: 12850,
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastOpenRooms() {
  const payload = JSON.stringify({
    type: 'ROOMS_LIST',
    rooms: roomManager.getOpenRooms(),
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function sendError(ws: WebSocket, code: string, message: string, requestId?: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        requestId,
        payload: { code, message, requestId },
      })
    );
  }
}

wss.on('connection', (ws: WebSocket) => {
  // Send initial open rooms list
  ws.send(
    JSON.stringify({
      type: 'ROOMS_LIST',
      rooms: roomManager.getOpenRooms(),
    })
  );

  ws.on('message', async (messageData: string) => {
    // Keep connection active and refresh lastSeen
    connectionManager.touchConnection(ws);

    // Transport rate limit check (30 msg/sec)
    if (!connectionManager.checkTransportRateLimit(ws)) {
      sendError(ws, 'RATE_LIMITED', 'Too many network messages. Please slow down.');
      return;
    }

    let rawJson: any;
    try {
      rawJson = JSON.parse(messageData.toString());
    } catch {
      sendError(ws, 'MALFORMED_JSON', 'Could not parse incoming JSON frame');
      return;
    }

    const parsed = ClientMessageSchema.safeParse(rawJson);
    if (!parsed.success) {
      console.warn('⚠️ Invalid client message schema:', parsed.error.format());
      sendError(ws, 'INVALID_SCHEMA', 'Message payload failed schema validation', rawJson?.requestId);
      return;
    }

    const message = parsed.data;
    const { requestId } = message;

    sessionManager.updatePing(ws);

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
          const { telegramId, playerName, avatarUrl } = message.payload;
          const user = await storage.getOrCreateUser({ id: telegramId, first_name: playerName, photo_url: avatarUrl });
          sessionManager.register(ws, telegramId, playerName, avatarUrl);
          connectionManager.registerConnection(telegramId, ws);

          ws.send(
            JSON.stringify({
              type: 'AUTH_OK',
              requestId,
              payload: { telegramId, user },
            })
          );
          break;
        }

        // --- 3. ROOM JOINING & SYNC ---
        case 'JOIN_ROOM': {
          const { roomCode, telegramId, playerName, avatarUrl } = message.payload;
          const code = roomCode.toUpperCase();
          const session = sessionManager.getSession(ws) || sessionManager.register(
            ws,
            telegramId || 123456789,
            playerName || 'Player 2',
            avatarUrl
          );
          connectionManager.registerConnection(session.telegramId, ws);

          // Check if rejoining an existing match
          const reconnectResult = roomManager.reconnectPlayer(code, session.telegramId);
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
            break;
          }

          // Otherwise, join room as new Player 2
          const result = roomManager.joinRoom(code, session.telegramId, session.name, session.avatarUrl);
          if (result.error) {
            sendError(ws, 'JOIN_FAILED', result.error, requestId);
            break;
          }

          if (result.room) {
            sessionManager.attachRoom(ws, code, 'p2');
            broadcastOpenRooms();
            const snapshot = roomManager.getRoomSnapshot(result.room);
            connectionManager.broadcast(result.room, {
              type: 'GAME_START',
              requestId,
              payload: snapshot,
            });
          }
          break;
        }

        case 'SYNC_ROOM': {
          const code = message.payload.roomCode.toUpperCase();
          const room = roomManager.getRoom(code);
          if (!room) {
            sendError(ws, 'ROOM_NOT_FOUND', 'Cannot sync: room does not exist', requestId);
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
          sessionManager.detachRoom(ws);
          roomManager.deleteRoom(code);
          broadcastOpenRooms();
          break;
        }

        // --- 4. GAMEPLAY ACTIONS (Server-Authoritative with Idempotency) ---
        case 'ROLL_DICE':
        case 'DROP_DISC':
        case 'CHOOSE_RPS': {
          if (!connectionManager.checkActionRateLimit(ws)) {
            sendError(ws, 'ACTION_RATE_LIMITED', 'Too many game moves submitted. Please wait a moment.', requestId);
            break;
          }

          const code = message.payload.roomCode.toUpperCase();
          const room = roomManager.getRoom(code);
          const session = sessionManager.getSession(ws);

          if (!room) {
            sendError(ws, 'ROOM_NOT_FOUND', 'Room not found', requestId);
            break;
          }

          const playerRole: PlayerRole = session?.playerRole || 'p1';
          const result = roomManager.executeAction(code, playerRole, message.type, message.payload, requestId);

          if (!result.success) {
            sendError(ws, 'ACTION_REJECTED', result.error || 'Invalid move', requestId);
            break;
          }

          // Broadcast authoritative action payload
          connectionManager.broadcast(room, {
            type: result.actionType,
            requestId,
            payload: {
              ...result.payload,
              version: room.version,
            },
          });

          // If game ended, execute financial settlement
          if (result.isGameOver && result.winner) {
            const winnerRole = result.winner;
            if (winnerRole === 'draw') {
              if (room.p1?.telegramId && room.p2?.telegramId) {
                const refund = await storage.finalizeDrawMatch(code, room.gameType, room.stakeAmount, room.p1.telegramId, room.p2.telegramId);
                room.version += 1;
                connectionManager.broadcast(room, {
                  type: 'GAME_OVER',
                  requestId,
                  payload: {
                    roomCode: code,
                    winner: 'draw',
                    potAmount: room.potAmount,
                    winnerPayout: refund.p1Refund,
                    loserPayout: refund.p2Refund,
                    arenaFee: refund.arenaFee,
                    xpEarned: 75,
                    version: room.version,
                  },
                });
              }
            } else {
              const winnerTgId = winnerRole === 'p1' ? room.p1?.telegramId : room.p2?.telegramId;
              const loserTgId = winnerRole === 'p1' ? room.p2?.telegramId : room.p1?.telegramId;

              if (winnerTgId && loserTgId) {
                const payout = await storage.finalizeWinMatch(code, room.gameType, room.stakeAmount, winnerTgId, loserTgId);
                room.version += 1;
                connectionManager.broadcast(room, {
                  type: 'GAME_OVER',
                  requestId,
                  payload: {
                    roomCode: code,
                    winner: winnerRole,
                    potAmount: room.potAmount,
                    winnerPayout: payout.winnerPayout,
                    loserPayout: payout.loserPayout,
                    arenaFee: payout.arenaFee,
                    xpEarned: 150,
                    version: room.version,
                  },
                });
              }
            }
          }
          break;
        }

        // --- 5. EMOTES ---
        case 'EMOTE': {
          const code = message.payload.roomCode.toUpperCase();
          const room = roomManager.getRoom(code);
          const session = sessionManager.getSession(ws);
          if (room && session) {
            connectionManager.broadcast(room, {
              type: 'EMOTE',
              payload: {
                player: session.playerRole || 'p1',
                emoji: message.payload.emoji,
              },
            });
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('❌ WebSocket Handler Error:', err);
      sendError(ws, 'INTERNAL_ERROR', 'An unexpected error occurred processing your request', requestId);
    }
  });

  ws.on('close', () => {
    matchmakingQueue.dequeue(ws);
    const session = sessionManager.remove(ws);
    connectionManager.removeConnection(ws);
    if (session) {
      roomManager.handleDisconnect(session.telegramId);
    }
  });
});

server.listen(Number(port), '0.0.0.0', () => {
  console.log(`🎮 Gibous Production Multiplayer Backend running on port ${port}`);
});
