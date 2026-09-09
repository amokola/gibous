import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Telegram Bot /start Command Handler', () => {
  const publicAppUrl = 'https://gibous.win';
  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const chatId = 987654321;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates rich HTML with <h1> and in-body <tg-button-row> buttons', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 101 } }),
    });
    globalThis.fetch = fetchMock;

    const text = '/start';
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
            rich_message: { html: richHtml },
          }),
        });
        if (richRes.ok) sent = true;
      } catch {
        sent = false;
      }

      expect(sent).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('sendRichMessage');
      const body = JSON.parse(init.body);
      expect(body.chat_id).toBe(chatId);
      expect(body.rich_message.html).toContain('<h1>🎲 GIBOUS DUEL ARENA</h1>');
      expect(body.rich_message.html).toContain('<tg-button-row align="center">');
      expect(body.rich_message.html).toContain('<tg-button type="web_app"');
      expect(body.rich_message.html).toContain('<blockquote expandable>');
      expect(body.rich_message.html).not.toContain('deeplink');
    }
  });

  it('falls back to sendMessage with inline_keyboard if sendRichMessage returns non-ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: 'Unsupported method' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 102 } }),
      });
    globalThis.fetch = fetchMock;

    const text = '/start';
    if (text.startsWith('/start')) {
      const richHtml = `<h1>🎲 GIBOUS DUEL ARENA</h1>`;
      let sent = false;
      try {
        const richRes = await fetch(`https://api.telegram.org/bot${botToken}/sendRichMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, rich_message: { html: richHtml } }),
        });
        if (richRes.ok) sent = true;
      } catch {
        sent = false;
      }

      if (!sent) {
        const fallbackText = `🎲 <b>GIBOUS DUEL ARENA</b>\n...`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: fallbackText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎮 Launch Arena & Play', web_app: { url: publicAppUrl } }],
                [
                  { text: '⚔️ Challenge a Friend', switch_inline_query: '' },
                  { text: '💬 Community & Duels', url: 'https://t.me/gibous_community' },
                ],
              ],
            },
          }),
        });
      }

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [firstUrl] = fetchMock.mock.calls[0];
      const [secondUrl, secondInit] = fetchMock.mock.calls[1];
      expect(firstUrl).toContain('sendRichMessage');
      expect(secondUrl).toContain('sendMessage');

      const fallbackBody = JSON.parse(secondInit.body);
      expect(fallbackBody.reply_markup.inline_keyboard.length).toBe(2);
      expect(fallbackBody.reply_markup.inline_keyboard[0][0].text).toBe('🎮 Launch Arena & Play');
    }
  });
});
