/**
 * Gibous Production-Grade Reliable Multiplayer Transport Layer
 *
 * Implements:
 * - Explicit connection states (DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING)
 * - Socket generation & identity isolation (prevents stale socket callbacks)
 * - Exponential backoff with jitter (1s -> 2s -> 4s -> 8s -> 16s -> 30s)
 * - Real ping/pong heartbeat with dead connection termination
 * - Typed message envelopes with requestIds & Zod runtime validation
 * - Smart selective queueing (max 100, drops ephemeral moves on disconnect)
 * - Subscription pattern returning unsubscribe functions
 * - Browser online/offline network adaptation
 * - Configurable WebSocket URL
 */

import {
  ConnectionState,
  ClientMessage,
  ServerMessage,
  ServerMessageSchema,
  ClientMessageType,
  ServerMessageType,
} from '../../shared';

export type TypedMessageListener<T = unknown> = (payload: T, fullMessage: ServerMessage) => void;

export class MultiplayerService {
  private static instance: MultiplayerService;

  private ws: WebSocket | null = null;
  private socketGeneration: number = 0;
  private url: string;
  private state: ConnectionState = 'DISCONNECTED';
  private isIntentionalClose: boolean = false;
  private currentRoomCode: string | null = null;

  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_RECONNECT_DELAY_MS = 30000;
  private readonly BASE_RECONNECT_DELAY_MS = 1000;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly PING_INTERVAL_MS = 15000;
  private readonly PONG_TIMEOUT_MS = 10000;
  private lastPingSentAt: number = 0;
  private lastPongReceivedAt: number = 0;

  private readonly MAX_QUEUE_SIZE = 100;
  private sendQueue: ClientMessage[] = [];

  private listeners: Map<string, Set<TypedMessageListener<any>>> = new Map();
  private stateListeners: Set<(state: ConnectionState) => void> = new Set();

  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private constructor() {
    this.url = this.resolveWsUrl();
    this.initNetworkListeners();
  }

  static getInstance(): MultiplayerService {
    if (!MultiplayerService.instance) {
      MultiplayerService.instance = new MultiplayerService();
    }
    return MultiplayerService.instance;
  }

  private resolveWsUrl(): string {
    const envUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WS_URL : undefined;
    if (envUrl) {
      return envUrl;
    }

    if (typeof window !== 'undefined' && window.location) {
      const isHttps = window.location.protocol === 'https:';
      const protocol = isHttps ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
      return `${protocol}//${host}:3001`;
    }

    return 'ws://127.0.0.1:3001';
  }

  private initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      if (this.state === 'DISCONNECTED' || this.state === 'RECONNECTING') {
        this.reconnectAttempts = 0;
        this.connect();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.clearReconnectTimer();
      this.setConnectionState('DISCONNECTED');
    });
  }

  public getConnectionState(): ConnectionState {
    return this.state;
  }

  public setCurrentRoomCode(roomCode: string | null): void {
    this.currentRoomCode = roomCode;
  }

  public getCurrentRoomCode(): string | null {
    return this.currentRoomCode;
  }

  public onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setConnectionState(newState: ConnectionState) {
    if (this.state === newState) return;
    this.state = newState;
    this.stateListeners.forEach((listener) => listener(newState));
  }

  /**
   * Connect to the WebSocket Server
   */
  public connect(): void {
    if (!this.isOnline) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;
    this.clearReconnectTimer();
    this.setConnectionState(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    const currentGeneration = ++this.socketGeneration;
    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (socket !== this.ws || currentGeneration !== this.socketGeneration) return;

      const isReconnecting = this.reconnectAttempts > 0 || this.state === 'RECONNECTING';
      this.reconnectAttempts = 0;
      this.setConnectionState('CONNECTED');
      this.startHeartbeat();
      this.flushQueue();

      // Auto-sync if we were previously in a room
      if (isReconnecting && this.currentRoomCode) {
        console.log(`🔄 Connection restored. Auto-syncing room state for ${this.currentRoomCode}...`);
        this.send('SYNC_ROOM', { roomCode: this.currentRoomCode });
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      if (socket !== this.ws || currentGeneration !== this.socketGeneration) return;

      try {
        const rawJson = JSON.parse(event.data);
        const parsed = ServerMessageSchema.safeParse(rawJson);

        if (!parsed.success) {
          console.warn('⚠️ Rejected invalid server message schema:', parsed.error);
          return;
        }

        const message = parsed.data;

        if (message.type === 'PONG') {
          this.handlePong(message.payload);
          return;
        }

        this.dispatchMessage(message);
      } catch (err) {
        console.error('❌ Failed to parse WebSocket frame:', err);
      }
    };

    socket.onclose = (_event: CloseEvent) => {
      if (socket !== this.ws || currentGeneration !== this.socketGeneration) return;

      this.stopHeartbeat();
      this.ws = null;

      if (this.isIntentionalClose) {
        this.setConnectionState('DISCONNECTED');
        return;
      }

      this.setConnectionState('RECONNECTING');
      this.scheduleReconnect();
    };

    socket.onerror = (err) => {
      if (socket !== this.ws || currentGeneration !== this.socketGeneration) return;
      console.warn('⚠️ WebSocket transport error (falling back to reconnect loop):', err);
    };
  }

  /**
   * Explicitly disconnect and terminate all reconnect loops
   */
  public disconnect(): void {
    this.isIntentionalClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (this.ws) {
      const socketToClose = this.ws;
      this.ws = null;
      try {
        socketToClose.close(1000, 'Intentional client disconnect');
      } catch {
        // Ignore close errors
      }
    }

    this.sendQueue = [];
    this.currentRoomCode = null;
    this.setConnectionState('DISCONNECTED');
  }

  /**
   * Send a strongly typed client message
   */
  public send(type: ClientMessageType, payload: any = {}): string {
    const requestId = this.generateRequestId();
    const message = {
      type,
      requestId,
      payload,
    } as ClientMessage;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to transmit message over socket:', err);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
      this.connect();
    }

    return requestId;
  }

  private queueMessage(message: ClientMessage) {
    // Selective Queueing: Only queue critical idempotent actions
    const allowedTypesToQueue: ClientMessageType[] = ['AUTH', 'JOIN_ROOM', 'SYNC_ROOM'];

    if (!allowedTypesToQueue.includes(message.type)) {
      return;
    }

    if (this.sendQueue.length >= this.MAX_QUEUE_SIZE) {
      this.sendQueue.shift(); // Drop oldest message
    }

    this.sendQueue.push(message);
  }

  private flushQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.sendQueue.length > 0) {
      const msg = this.sendQueue.shift();
      if (msg) {
        try {
          this.ws.send(JSON.stringify(msg));
        } catch {
          this.sendQueue.unshift(msg);
          break;
        }
      }
    }
  }

  /**
   * Subscribe to server messages with a clean unsubscribe function
   */
  public on<T = any>(type: ServerMessageType | 'connected' | 'disconnected', listener: TypedMessageListener<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    const set = this.listeners.get(type)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  /**
   * Unsubscribe from server messages
   */
  public off<T = any>(type: ServerMessageType | 'connected' | 'disconnected', listener: TypedMessageListener<T>): void {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    }
  }

  private dispatchMessage(message: ServerMessage) {
    if (message.type === 'GAME_START' || message.type === 'ROOM_STATE') {
      this.currentRoomCode = message.payload.code;
    } else if (message.type === 'ROOM_CANCELLED') {
      if (this.currentRoomCode === message.roomCode) {
        this.currentRoomCode = null;
      }
    }

    const typeListeners = this.listeners.get(message.type);
    if (typeListeners) {
      typeListeners.forEach((listener) => {
        try {
          const payload = 'payload' in message ? message.payload : ('rooms' in message ? message.rooms : message);
          listener(payload, message);
        } catch (err) {
          console.error(`Error in listener for ${message.type}:`, err);
        }
      });
    }
  }

  // --- HEARTBEAT / PING-PONG LIVENESS ---

  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongReceivedAt = Date.now();

    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      this.lastPingSentAt = Date.now();
      const pingMsg: ClientMessage = {
        type: 'PING',
        requestId: this.generateRequestId(),
        payload: { timestamp: this.lastPingSentAt },
      };

      try {
        this.ws.send(JSON.stringify(pingMsg));
      } catch {
        return;
      }

      // Check if previous pong timed out
      this.pingTimeoutTimer = setTimeout(() => {
        if (Date.now() - this.lastPongReceivedAt > this.PONG_TIMEOUT_MS + this.PING_INTERVAL_MS) {
          console.warn('⚠️ Server heartbeat timeout (No PONG received). Terminating dead socket...');
          if (this.ws) {
            try {
              this.ws.close();
            } catch {
              // Ignore
            }
          }
        }
      }, this.PONG_TIMEOUT_MS);
    }, this.PING_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
      this.pingTimeoutTimer = null;
    }
  }

  private handlePong(_payload: { timestamp: number; clientTimestamp: number }) {
    this.lastPongReceivedAt = Date.now();
    if (this.pingTimeoutTimer) {
      clearTimeout(this.pingTimeoutTimer);
      this.pingTimeoutTimer = null;
    }
  }

  // --- EXPONENTIAL BACKOFF WITH JITTER ---

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isIntentionalClose || !this.isOnline) return;

    this.reconnectAttempts++;

    // Calculate delay: 1s, 2s, 4s, 8s, 16s... up to 30s
    const exponentialDelay = Math.min(
      this.MAX_RECONNECT_DELAY_MS,
      this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1)
    );

    // Jitter: +/- 20% to prevent synchronized herd reconnects
    const jitter = 0.8 + Math.random() * 0.4;
    const finalDelay = Math.floor(exponentialDelay * jitter);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, finalDelay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private generateRequestId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export const multiplayerService = MultiplayerService.getInstance();
