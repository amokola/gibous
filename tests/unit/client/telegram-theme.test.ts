import { describe, expect, it } from 'vitest';
import { resolveTelegramTheme } from '../../../src/utils/telegramTheme';

describe('resolveTelegramTheme', () => {
  it('maps Telegram theme colors to app tokens', () => {
    expect(resolveTelegramTheme({
      bg_color: '#101820',
      secondary_bg_color: '#202a34',
      text_color: '#f1f5f9',
      hint_color: '#94a3b8',
      link_color: '#38bdf8',
      button_color: '#0369a1',
      button_text_color: '#ffffff',
      header_bg_color: '#0b1118',
    })).toEqual({
      background: '#101820',
      surface: '#202a34',
      shell: '#202a34',
      text: '#f1f5f9',
      hint: '#94a3b8',
      link: '#38bdf8',
      button: '#0369a1',
      buttonText: '#ffffff',
      header: '#0b1118',
    });
  });

  it('keeps the branded defaults when values are absent or malformed', () => {
    expect(resolveTelegramTheme({ bg_color: 'red' })).toMatchObject({
      background: '#f2efe9',
      surface: '#fbfaf7',
      shell: '#e8e0d0',
      text: '#1a1a1a',
    });
  });
});
