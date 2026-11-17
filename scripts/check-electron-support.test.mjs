import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isWithinSupportedMajors, majorOf, SUPPORTED_MAJORS } from './check-electron-support.mjs';

describe('check-electron-support', () => {
  it('reads the major version', () => {
    expect(majorOf('45.3.3')).toBe(45);
    expect(majorOf('v46.0.0-beta.1')).toBe(46);
    expect(majorOf('latest')).toBeNaN();
  });

  it('accepts the last two majors and refuses older ones', () => {
    expect(SUPPORTED_MAJORS).toBe(2);
    expect(isWithinSupportedMajors('45.3.3', '45.3.3')).toBe(true);
    expect(isWithinSupportedMajors('44.0.0', '45.1.0')).toBe(true);
    expect(isWithinSupportedMajors('43.9.9', '45.1.0')).toBe(false);
    expect(isWithinSupportedMajors('46.0.0-beta.1', '45.1.0')).toBe(true);
    expect(isWithinSupportedMajors('garbage', '45.1.0')).toBe(false);
  });

  it('apps/desktop pins Electron to a single major with a caret range', () => {
    const pkg = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8'));
    expect(pkg.devDependencies.electron).toMatch(/^\^\d+\.\d+\.\d+$/);
  });
});
