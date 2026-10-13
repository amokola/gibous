export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
}

export interface ResolvedTelegramTheme {
  background: string;
  surface: string;
  shell: string;
  text: string;
  hint: string;
  link: string;
  button: string;
  buttonText: string;
  header: string;
}

function colorOr(value: string | undefined, fallback: string): string {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

export function resolveTelegramTheme(params?: TelegramThemeParams): ResolvedTelegramTheme {
  const background = colorOr(params?.bg_color, '#f2efe9');
  return {
    background,
    surface: colorOr(params?.secondary_bg_color, '#fbfaf7'),
    shell: colorOr(params?.secondary_bg_color, '#e8e0d0'),
    text: colorOr(params?.text_color, '#1a1a1a'),
    hint: colorOr(params?.hint_color, '#666666'),
    link: colorOr(params?.link_color, '#2481cc'),
    button: colorOr(params?.button_color, '#2481cc'),
    buttonText: colorOr(params?.button_text_color, '#ffffff'),
    header: colorOr(params?.header_bg_color, background),
  };
}
