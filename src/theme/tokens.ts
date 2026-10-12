/**
 * Science of Gifts - Centralized Theme & Design Token System (Phase 3)
 * Provides centralized tokens for colors, typography roles, and visual properties.
 * Default theme represents the exact classic Science of Gifts aesthetic.
 */

export type ThemeId = 'default' | 'editorial' | 'minimal' | 'classic' | 'warm' | 'dark_editorial';

export interface ColorTokens {
  appBackground: string;
  surfacePrimary: string;
  surfaceSecondary: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  accentPrimary: string;
  accentHover: string;
  accentText: string;
  success: string;
  warning: string;
  error: string;
}

export interface TypographyTokens {
  displayFont: string;
  uiFont: string;
  editorFont: string;
  baseFontSize: string;
  editorLineHeight: string;
  headingScale: string;
}

export interface VisualTokens {
  borderRadiusSmall: string;
  borderRadiusMedium: string;
  borderRadiusLarge: string;
  shadowStrength: string;
  editorMaxWidth: string;
  uiDensity: 'compact' | 'normal' | 'spacious';
}

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  description: string;
  colors: ColorTokens;
  typography: TypographyTokens;
  visual: VisualTokens;
}

/**
 * Default Theme - Science of Gifts Classic
 * Matches the current publication aesthetic exactly.
 */
export const DEFAULT_THEME: ThemeTokens = {
  id: 'default',
  name: 'Default (Science of Gifts Classic)',
  description: 'Warm, refined paper surfaces with civilized stone borders and classical typography.',
  colors: {
    appBackground: '#faf9f6',
    surfacePrimary: '#ffffff',
    surfaceSecondary: '#f6f3eb',
    surfaceElevated: '#fdfbf7',
    textPrimary: '#1e232a',
    textSecondary: '#5c5447',
    textMuted: '#8a8275',
    border: '#e5dfd3',
    borderSubtle: '#ede7db',
    accentPrimary: '#92400e', // amber-800
    accentHover: '#78350f',   // amber-900
    accentText: '#ffffff',
    success: '#15803d',       // emerald-700
    warning: '#b45309',       // amber-700
    error: '#b91c1c',         // red-700
  },
  typography: {
    displayFont: "'Cinzel', Georgia, serif",
    uiFont: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    editorFont: "'Newsreader', Georgia, Cambria, 'Times New Roman', serif",
    baseFontSize: '16px',
    editorLineHeight: '1.85',
    headingScale: '1.25',
  },
  visual: {
    borderRadiusSmall: '0.375rem',  // 6px
    borderRadiusMedium: '0.5rem',   // 8px
    borderRadiusLarge: '0.75rem',   // 12px
    shadowStrength: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    editorMaxWidth: '840px',
    uiDensity: 'normal',
  },
};

/**
 * Registry of available themes.
 * Currently Default is active; architecture prepared for future themes.
 */
export const THEMES_REGISTRY: Record<ThemeId, ThemeTokens> = {
  default: DEFAULT_THEME,
  editorial: {
    ...DEFAULT_THEME,
    id: 'editorial',
    name: 'Editorial Crisp',
    description: 'High contrast off-white newsprint with slate text and sharp margins.',
    colors: {
      appBackground: '#fcfcfc',
      surfacePrimary: '#ffffff',
      surfaceSecondary: '#f4f5f7',
      surfaceElevated: '#ffffff',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#94a3b8',
      border: '#e2e8f0',
      borderSubtle: '#f1f5f9',
      accentPrimary: '#1e293b',
      accentHover: '#0f172a',
      accentText: '#ffffff',
      success: '#15803d',
      warning: '#b45309',
      error: '#b91c1c',
    },
  },
  minimal: {
    ...DEFAULT_THEME,
    id: 'minimal',
    name: 'Minimal Clean',
    description: 'Understated monochrome surfaces for distraction-free drafting.',
    colors: {
      appBackground: '#f8f8f8',
      surfacePrimary: '#ffffff',
      surfaceSecondary: '#f1f1f2',
      surfaceElevated: '#ffffff',
      textPrimary: '#18181b',
      textSecondary: '#52525b',
      textMuted: '#a1a1aa',
      border: '#e4e4e7',
      borderSubtle: '#f4f4f5',
      accentPrimary: '#27272a',
      accentHover: '#18181b',
      accentText: '#ffffff',
      success: '#16a34a',
      warning: '#d97706',
      error: '#dc2626',
    },
  },
  classic: {
    ...DEFAULT_THEME,
    id: 'classic',
    name: 'Classic Archive',
    description: 'Subtle sepia tones with traditional bookbinding parchment.',
    colors: {
      appBackground: '#f6f1e7',
      surfacePrimary: '#fbf9f4',
      surfaceSecondary: '#ede6d6',
      surfaceElevated: '#ffffff',
      textPrimary: '#26221c',
      textSecondary: '#574e42',
      textMuted: '#877c6c',
      border: '#ded5c3',
      borderSubtle: '#e8e1d2',
      accentPrimary: '#78350f',
      accentHover: '#5c290c',
      accentText: '#ffffff',
      success: '#15803d',
      warning: '#b45309',
      error: '#b91c1c',
    },
  },
  warm: {
    ...DEFAULT_THEME,
    id: 'warm',
    name: 'Warm Linen',
    description: 'Cozy honey-tinted background with deep espresso accents.',
    colors: {
      appBackground: '#fbf8f1',
      surfacePrimary: '#ffffff',
      surfaceSecondary: '#f5eee1',
      surfaceElevated: '#fdfcf9',
      textPrimary: '#2a221b',
      textSecondary: '#645447',
      textMuted: '#968474',
      border: '#e6dcce',
      borderSubtle: '#efe7dc',
      accentPrimary: '#854d0e',
      accentHover: '#713f12',
      accentText: '#ffffff',
      success: '#15803d',
      warning: '#b45309',
      error: '#b91c1c',
    },
  },
  dark_editorial: {
    ...DEFAULT_THEME,
    id: 'dark_editorial',
    name: 'Dark Editorial',
    description: 'Deep charcoal background with civilized amber luminescence.',
    colors: {
      appBackground: '#181a1d',
      surfacePrimary: '#212429',
      surfaceSecondary: '#292d33',
      surfaceElevated: '#32373e',
      textPrimary: '#f3f4f6',
      textSecondary: '#d1d5db',
      textMuted: '#9ca3af',
      border: '#373e47',
      borderSubtle: '#2d333b',
      accentPrimary: '#d97706',
      accentHover: '#b45309',
      accentText: '#ffffff',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  },
};

/**
 * Converts theme tokens to CSS variable map
 */
export function getThemeCssVariables(theme: ThemeTokens): Record<string, string> {
  return {
    '--theme-bg-app': theme.colors.appBackground,
    '--theme-surface-primary': theme.colors.surfacePrimary,
    '--theme-surface-secondary': theme.colors.surfaceSecondary,
    '--theme-surface-elevated': theme.colors.surfaceElevated,
    '--theme-text-primary': theme.colors.textPrimary,
    '--theme-text-secondary': theme.colors.textSecondary,
    '--theme-text-muted': theme.colors.textMuted,
    '--theme-border': theme.colors.border,
    '--theme-border-subtle': theme.colors.borderSubtle,
    '--theme-accent-primary': theme.colors.accentPrimary,
    '--theme-accent-hover': theme.colors.accentHover,
    '--theme-accent-text': theme.colors.accentText,
    '--theme-success': theme.colors.success,
    '--theme-warning': theme.colors.warning,
    '--theme-error': theme.colors.error,

    '--theme-font-display': theme.typography.displayFont,
    '--theme-font-ui': theme.typography.uiFont,
    '--theme-font-editor': theme.typography.editorFont,
    '--theme-font-size-base': theme.typography.baseFontSize,
    '--theme-editor-line-height': theme.typography.editorLineHeight,

    '--theme-radius-sm': theme.visual.borderRadiusSmall,
    '--theme-radius-md': theme.visual.borderRadiusMedium,
    '--theme-radius-lg': theme.visual.borderRadiusLarge,
    '--theme-editor-max-width': theme.visual.editorMaxWidth,
  };
}

/**
 * Applies theme CSS variables to the document root element
 */
export function applyTheme(themeId: ThemeId = 'default'): void {
  const theme = THEMES_REGISTRY[themeId] || DEFAULT_THEME;
  const vars = getThemeCssVariables(theme);
  const root = document.documentElement;

  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.setAttribute('data-theme', theme.id);
}
