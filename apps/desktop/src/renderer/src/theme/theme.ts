// Pure theme logic (no DOM), so it can be unit-tested in node.

export const THEME_PREFS = ['system', 'dark', 'light'] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export type ResolvedTheme = 'dark' | 'light';

export const DENSITIES = ['compact', 'comfortable'] as const;
export type Density = (typeof DENSITIES)[number];

export interface ThemeSettings {
  theme: ThemePref;
  density: Density;
}

export const DEFAULT_SETTINGS: ThemeSettings = { theme: 'system', density: 'compact' };

export const STORAGE_KEY = 'cc.appearance';

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** Next preference when the user cycles through them (system → dark → light → system). */
export function nextThemePref(pref: ThemePref): ThemePref {
  const i = THEME_PREFS.indexOf(pref);
  return THEME_PREFS[(i + 1) % THEME_PREFS.length] ?? 'system';
}

/** Reads stored settings; anything unexpected falls back to the defaults. */
export function parseSettings(raw: string | null): ThemeSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS;
    const { theme, density } = value as Record<string, unknown>;
    return {
      theme: THEME_PREFS.find((t) => t === theme) ?? DEFAULT_SETTINGS.theme,
      density: DENSITIES.find((d) => d === density) ?? DEFAULT_SETTINGS.density,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
