export const WIDGET_THEME_IDS = [
  'paper-ink', 'noir-brass', 'ivory-cellar', 'lamp-amber', 'cigar-green',
  'smoked-rose', 'velvet-violet', 'midnight-blue', 'high-contrast'
] as const;
export type WidgetTheme = (typeof WIDGET_THEME_IDS)[number];
// Persisted IDs are intentionally stable, including the renamed brand default.
export const DEFAULT_WIDGET_THEME_ID: WidgetTheme = 'paper-ink';

type ThemeSeed = {
  id: WidgetTheme; label: string; description: string; dark: boolean;
  surface: string; inset: string; text: string;
  widget: string; symbol: string; signal: string; accentText: string;
};
export const mixThemeColor = (foreground: string, background: string, amount: number): string =>
  '#' + [1, 3, 5].map(index => Math.round(
    parseInt(foreground.slice(index, index + 2), 16) * amount +
    parseInt(background.slice(index, index + 2), 16) * (1 - amount)
  ).toString(16).padStart(2, '0')).join('');

function defineTheme(seed: ThemeSeed) {
  const lightWidget = seed.id === 'ivory-cellar';
  const contrast = seed.id === 'high-contrast';
  const colors = {
    surface: seed.surface, inset: seed.inset, text: seed.text,
    raised: mixThemeColor(seed.text, seed.surface, .025),
    muted: mixThemeColor(seed.text, seed.surface, .76),
    border: mixThemeColor(seed.text, seed.surface, contrast ? .7 : .18),
    controlBorder: mixThemeColor(seed.text, seed.surface, .58),
    hover: mixThemeColor(seed.text, seed.surface, .06),
    selected: mixThemeColor(seed.text, seed.surface, .10),
    action: seed.text, actionText: seed.surface, accent: seed.accentText,
    error: seed.dark ? '#ffada0' : '#9f3029',
    warning: seed.dark ? '#f1cc83' : '#79531a',
    widget: seed.widget, symbol: seed.symbol, signal: seed.signal,
    idle: mixThemeColor(seed.symbol, seed.widget, .65),
    widgetError: lightWidget ? '#9f3029' : '#ffada0',
    widgetWarning: lightWidget ? '#79531a' : '#f1cc83'
  };
  return { ...seed, colors, swatches: [colors.widget, colors.symbol, colors.signal] as const };
}
export type WidgetThemeOption = ReturnType<typeof defineTheme>;

/** One palette per theme. CSS, picker miniatures and previews consume these roles. */
export const WIDGET_THEME_OPTIONS: readonly WidgetThemeOption[] = [
  defineTheme({ id: 'paper-ink', label: 'speakeasy.', description: 'Paper, aubergine & coral', dark: false,
    surface: '#fbf7f1', inset: '#f6f0e7', text: '#24152e', widget: '#24152e', symbol: '#f6f0e7', signal: '#e06954', accentText: '#ad3325' }),
  defineTheme({ id: 'noir-brass', label: 'noir brass', description: 'Warm black & brass', dark: true,
    surface: '#1f1810', inset: '#15100c', text: '#f3e9d8', widget: '#15100c', symbol: '#f3e9d8', signal: '#d8a14a', accentText: '#d8a14a' }),
  defineTheme({ id: 'ivory-cellar', label: 'ivory cellar', description: 'Ivory & warm brown', dark: false,
    surface: '#fff7e8', inset: '#f1e5cf', text: '#2b1f18', widget: '#e8dbc2', symbol: '#2b1f18', signal: '#7a4f2a', accentText: '#7a4f2a' }),
  defineTheme({ id: 'lamp-amber', label: 'lamp amber', description: 'Dark walnut & amber', dark: true,
    surface: '#2b1e0d', inset: '#211608', text: '#fff0cf', widget: '#24160c', symbol: '#fff0cf', signal: '#eeb046', accentText: '#eeb046' }),
  defineTheme({ id: 'cigar-green', label: 'cigar green', description: 'Forest & sage', dark: true,
    surface: '#1a2218', inset: '#111912', text: '#f1ecd7', widget: '#111912', symbol: '#f1ecd7', signal: '#a4bf75', accentText: '#a4bf75' }),
  defineTheme({ id: 'smoked-rose', label: 'smoked rose', description: 'Burgundy & dusty rose', dark: true,
    surface: '#301d1f', inset: '#211316', text: '#f8e8df', widget: '#211316', symbol: '#f8e8df', signal: '#e7a4aa', accentText: '#e7a4aa' }),
  defineTheme({ id: 'velvet-violet', label: 'velvet violet', description: 'Plum & lavender', dark: true,
    surface: '#21182b', inset: '#1b1220', text: '#f0e6f3', widget: '#1b1220', symbol: '#f0e6f3', signal: '#b599d6', accentText: '#b599d6' }),
  defineTheme({ id: 'midnight-blue', label: 'midnight blue', description: 'Midnight & soft blue', dark: true,
    surface: '#182235', inset: '#101724', text: '#eef2f8', widget: '#101724', symbol: '#eef2f8', signal: '#8daedc', accentText: '#8daedc' }),
  defineTheme({ id: 'high-contrast', label: 'high contrast', description: 'Black, white & yellow', dark: true,
    surface: '#000000', inset: '#000000', text: '#ffffff', widget: '#000000', symbol: '#ffffff', signal: '#ffd666', accentText: '#ffd666' })
];
export const getWidgetTheme = (id: WidgetTheme): WidgetThemeOption =>
  WIDGET_THEME_OPTIONS.find(theme => theme.id === id) ?? WIDGET_THEME_OPTIONS[0];

const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(' ');
export function getThemeCssVariables(id: WidgetTheme): Record<string, string> {
  const { colors: c } = getWidgetTheme(id);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(c)) {
    result['--theme-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())] = value;
  }
  // Compatibility for shared settings controls still using HUD token names.
  Object.assign(result, {
    '--hud-surface-rgb': rgb(c.surface), '--hud-surface-deep-rgb': rgb(c.inset),
    '--hud-surface-lift-rgb': rgb(c.raised), '--hud-accent-rgb': rgb(c.accent),
    '--hud-muted-rgb': rgb(c.muted), '--hud-dim-rgb': rgb(c.muted), '--hud-alert-rgb': rgb(c.error),
    '--hud-text': c.text, '--hud-brass': c.accent, '--hud-ember': c.error,
    '--spine-widget-bg': c.widget, '--spine-widget-fg': c.symbol, '--spine-widget-accent': c.signal,
    '--spine-aubergine': c.text, '--spine-oat': c.surface, '--spine-coral': c.accent,
    '--spine-sage': c.muted
  });
  return result;
}

const WIDGET_THEME_ID_SET = new Set<string>(WIDGET_THEME_IDS);

export const isWidgetThemeId = (value: unknown): value is WidgetTheme =>
  typeof value === 'string' && WIDGET_THEME_ID_SET.has(value);

const LEGACY_WIDGET_THEME_ID_MAP: Readonly<Record<string, WidgetTheme>> = {
  default: 'noir-brass',
  'graphite-lime': 'cigar-green',
  'paper-ink': 'paper-ink',
  'electric-blue': 'midnight-blue',
  'midnight-cyan': 'midnight-blue',
  'forest-amber': 'cigar-green',
  'rose-quartz': 'smoked-rose',
  'violet-arc': 'velvet-violet',
  'mono-slate': 'high-contrast'
};

export const normalizeWidgetThemeId = (value: unknown): WidgetTheme => {
  if (isWidgetThemeId(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return LEGACY_WIDGET_THEME_ID_MAP[value] ?? DEFAULT_WIDGET_THEME_ID;
  }

  return DEFAULT_WIDGET_THEME_ID;
};
