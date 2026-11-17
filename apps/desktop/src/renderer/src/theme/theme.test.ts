import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, nextThemePref, parseSettings, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('follows the system only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('nextThemePref', () => {
  it('cycles system → dark → light → system', () => {
    expect(nextThemePref('system')).toBe('dark');
    expect(nextThemePref('dark')).toBe('light');
    expect(nextThemePref('light')).toBe('system');
  });
});

describe('parseSettings', () => {
  it('reads valid stored settings', () => {
    expect(parseSettings('{"theme":"light","density":"comfortable"}')).toEqual({
      theme: 'light',
      density: 'comfortable',
    });
  });

  it('falls back to defaults on missing, corrupt or unexpected data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"theme":"neon","density":3}')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a valid field when the other one is invalid', () => {
    expect(parseSettings('{"theme":"dark","density":"huge"}')).toEqual({
      theme: 'dark',
      density: DEFAULT_SETTINGS.density,
    });
  });
});
