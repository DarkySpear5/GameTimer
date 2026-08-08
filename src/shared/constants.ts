import type { ThemeColors, ThemeName } from './types'

// Each preset defines the whole palette. GREEN/RED/GOLD stay constant across
// themes since they're functional (play/pause/complete), not decorative —
// carried over verbatim from the v1 Tkinter app's theme table.
export const THEMES: Record<Exclude<ThemeName, 'Custom'>, ThemeColors> = {
  'Midnight Blue': {
    bg: '#1e1e2e',
    panel: '#181825',
    card: '#26263a',
    text: '#cdd6f4',
    subtext: '#9399b2',
    accent: '#89b4fa'
  },
  'Paper White': {
    bg: '#f5f5f7',
    panel: '#e8e8ec',
    card: '#ffffff',
    text: '#1e1e2e',
    subtext: '#5c5c66',
    accent: '#3b6fd6'
  },
  'Slate Grey': {
    bg: '#232326',
    panel: '#1c1c1f',
    card: '#2e2e33',
    text: '#e4e4e7',
    subtext: '#9a9aa2',
    accent: '#a0a0ad'
  },
  Rose: {
    bg: '#2b1e26',
    panel: '#241a20',
    card: '#3a2530',
    text: '#f6e0e8',
    subtext: '#c9a3b2',
    accent: '#f5a6c9'
  },
  'Retro Terminal': {
    bg: '#0a0f0a',
    panel: '#050805',
    card: '#0f180f',
    text: '#33ff66',
    subtext: '#1f9e42',
    accent: '#33ff66'
  }
}

export const THEME_ORDER: ThemeName[] = [
  'Midnight Blue',
  'Paper White',
  'Slate Grey',
  'Rose',
  'Retro Terminal',
  'Custom'
]

export const DEFAULT_CUSTOM_COLORS: ThemeColors = { ...THEMES['Midnight Blue'] }

// Functional colors — never themeable (play/pause/complete state).
export const GREEN = '#a6e3a1'
export const RED = '#f38ba8'
export const GOLD = '#f9e2af'

export const FONT_CHOICES = [
  'Segoe UI',
  'Verdana',
  'Arial',
  'Calibri',
  'Trebuchet MS',
  'Georgia',
  'Comic Sans MS'
]

export const FONT_SCALE_MIN = 1.0
export const FONT_SCALE_MAX = 1.5

export const ICON_SIZE_OPTIONS: Record<string, number> = {
  Small: 24,
  Medium: 36,
  Large: 52,
  'Extra Large': 72
}

// Caps applied whenever an icon/background image is imported (fresh upload,
// duplicating a profile, or a v1 legacy import) — see main/util/imageResize.ts.
// Icons never render above ICON_SIZE_OPTIONS['Extra Large'] (72px); backgrounds
// fill at most the main content pane. Both are generous relative to real
// on-screen size so there's no visible quality loss, even on a HiDPI display.
export const ICON_MAX_DIMENSION = 256
export const BACKGROUND_MAX_DIMENSION = 2560

export const GENRE_OPTIONS = [
  'Action',
  'Adventure',
  'RPG',
  'Strategy',
  'Simulation',
  'Sports',
  'Racing',
  'Puzzle',
  'Platformer',
  'Shooter',
  'Fighting',
  'Horror',
  'Survival',
  'Open World',
  'MMO',
  'Visual Novel',
  'Rhythm',
  'Card / Board Game',
  'Party',
  'Roguelike',
  'FPS',
  '3rd Person',
  'Isometric View',
  'Farming',
  'Automation',
  'Turn-Based',
  'Sci-Fi',
  'Adult',
  'Anime',
  'Space',
  'Story-Rich',
  'Hack and Slash',
  'Soulslike',
  'Cozy',
  'Casual',
  'Dungeon Crawler',
  'Retro',
  'Multiple Endings',
  'Gore',
  'Sandbox',
  'Difficult',
  'Bullet Hell',
  'Stealth',
  'Idle',
  'Deckbuilding',
  'Team-Based',
  'Tower Defense',
  'Looter Shooter',
  'Life-Sim',
  'Magic',
  'Fantasy'
] as const

export type GenreKey = (typeof GENRE_OPTIONS)[number]

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  ru: 'Русский',
  ja: '日本語',
  ko: '한국어',
  it: 'Italiano',
  de: 'Deutsch',
  pt: 'Português (Brasil)',
  zh: '中文 (简体)'
}

export const LANGUAGE_ORDER = ['en', 'fr', 'es', 'ru', 'ja', 'ko', 'it', 'de', 'pt', 'zh']

// Timer engine cadence — mirrors the v1 Tkinter app's _tick() intervals exactly.
export const UI_TICK_MS = 500
export const CHECKPOINT_MS = 5000
export const STATUS_LOG_MS = 60000
export const BACKUP_RETENTION_DAYS = 14

/**
 * A Play→Pause cycle shorter than this is still written to the session log,
 * but is excluded from the session count and the average. Pressing Play by
 * mistake should not inflate "times played" or drag the average down — and
 * silently discarding the entry instead would throw away real data.
 */
export const MIN_SESSION_SECONDS = 60
