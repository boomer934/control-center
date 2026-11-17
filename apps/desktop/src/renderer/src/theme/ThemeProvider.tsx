import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  parseSettings,
  resolveTheme,
  STORAGE_KEY,
  type Density,
  type ResolvedTheme,
  type ThemePref,
  type ThemeSettings,
} from './theme';

interface ThemeContextValue extends ThemeSettings {
  resolved: ResolvedTheme;
  setTheme(theme: ThemePref): void;
  setDensity(density: Density): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function load(): ThemeSettings {
  try {
    return parseSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(load);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(settings.theme, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.density = settings.density;
    root.dataset.themePref = settings.theme;
  }, [resolved, settings.density, settings.theme]);

  const update = useCallback((patch: Partial<ThemeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable; the choice then lasts for this run only.
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...settings,
      resolved,
      setTheme: (theme) => update({ theme }),
      setDensity: (density) => update({ density }),
    }),
    [settings, resolved, update],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
