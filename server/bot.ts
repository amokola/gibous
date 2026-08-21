/**
 * Gibous Telegram Bot Dispatcher
 * Handles /start, /play commands and deep link routing (?startapp=ROOM_CODE)
 */

export class TelegramBotDispatcher {
  private botUsername: string;

  constructor(botUsername: string = 'gibous_bot') {
    this.botUsername = botUsername;
  }

  /**
   * Generate a Telegram WebApp deep-link URL for room invitation
   * @param roomCode 6-character match code
   */
  generateInviteUrl(roomCode: string, potAmount: number): string {
    return `https://t.me/${this.botUsername}/app?startapp=${roomCode}`;
  }

  /**
   * Generate full Telegram share link
   */
  generateShareUrl(roomCode: string, potAmount: number): string {
    const inviteUrl = this.generateInviteUrl(roomCode, potAmount);
    const text = `⚔️ Duel me in Gibous Duel Arena!\n🎲 Pot: ${potAmount} Play GRAM (10% Arena Fee on win | 95% Draw Refund)\nRoom Code: ${roomCode}`;
    return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
  }
}
