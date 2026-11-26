import type { ErrorLanguage } from '../schema';

/** A frame as printed: `path` is raw (absolute, relative, a URL), before workspace mapping. */
export interface RawFrame {
  path: string;
  line?: number;
  column?: number;
  fn?: string;
}

export interface RawError {
  language: ErrorLanguage;
  message: string;
  /** Innermost (closest to the failure) first. */
  frames: RawFrame[];
}

/** An error a parser found, with the lines it spans (`end` excluded). */
export interface Found {
  start: number;
  end: number;
  error: RawError;
}

/**
 * One language of the registry. `find` gets the output already split in lines, without ANSI
 * codes and container prefixes, and returns every error it recognizes.
 */
export interface StackParser {
  language: ErrorLanguage;
  find(lines: readonly string[]): Found[];
}

export const toInt = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Nearest non-empty line before `index`, with its index. */
export function lineBefore(lines: readonly string[], index: number): number | undefined {
  for (let i = index - 1; i >= 0 && i >= index - 3; i--) if (lines[i]!.trim()) return i;
  return undefined;
}
