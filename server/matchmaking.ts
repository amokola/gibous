import { WebSocket } from 'ws';

export interface QueuedPlayer {
  telegramId: number;
  name: string;
  avatarUrl?: string;
  gameType: string;
  stake: number;
  ws: WebSocket;
  joinedAt: number;
}

export class MatchmakingQueue {
  private queue: QueuedPlayer[] = [];
  private onMatchFound: (p1: QueuedPlayer, p2: QueuedPlayer, gameType: string, stake: number) => void;

  constructor(onMatchFound: (p1: QueuedPlayer, p2: QueuedPlayer, gameType: string, stake: number) => void) {
    this.onMatchFound = onMatchFound;
  }

  enqueue(player: QueuedPlayer) {
    // Remove if already in queue
    this.dequeue(player.ws);

    // Look for matching opponent in queue (same gameType and same stake)
    const matchIdx = this.queue.findIndex(
      (p) => p.gameType === player.gameType && p.stake === player.stake && p.telegramId !== player.telegramId
    );

    if (matchIdx >= 0) {
      const opponent = this.queue.splice(matchIdx, 1)[0];
      this.onMatchFound(opponent, player, player.gameType, player.stake);
      return;
    }

    // Add real player to queue until another real opponent joins
    this.queue.push(player);
  }

  dequeue(ws: WebSocket) {
    this.queue = this.queue.filter((p) => p.ws !== ws);
  }
}
