// Walks the workspace for the model: regular files only, .gitignore applied, symbolic links and
// junctions never followed (they could lead outside the workspace), and a hard cap on the number
// of files. Only names, sizes and modification times are read here.
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { IgnoreRules } from './ignore-rules.ts';
import { isProjectPath, MAX_PROJECT_FILES } from './schema.ts';

export interface ScannedFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface ScanResult {
  files: Map<string, ScannedFile>;
  truncated: boolean;
}

const MAX_DEPTH = 64;
const STAT_CONCURRENCY = 32;

export const absolutePath = (root: string, path: string) =>
  path === '' ? root : join(root, ...path.split('/'));

/** Runs `task` over `items` with at most `limit` in flight. */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

/**
 * True when `path` and each directory above it, up to the root, is a real directory: not a
 * symbolic link, not a junction, not gone. `lstat` follows links in the middle of a path, so a
 * path reported by the watcher is checked one level at a time.
 */
export async function realDirectory(root: string, path: string): Promise<boolean> {
  const parts = path ? path.split('/') : [];
  for (let end = 1; end <= parts.length; end += 1) {
    const info = await lstat(absolutePath(root, parts.slice(0, end).join('/'))).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) return false;
  }
  return true;
}

/** Stats one candidate file. Null when it is not a regular file (or is gone). */
export async function statFile(root: string, path: string): Promise<ScannedFile | null> {
  const info = await lstat(absolutePath(root, path)).catch(() => null);
  if (!info?.isFile()) return null;
  return { path, size: info.size, mtimeMs: info.mtimeMs };
}

/**
 * Scans `start` (a directory relative to the root, '' for the whole workspace). The caller has
 * already checked that `start` itself is not ignored.
 */
export async function scanTree(
  root: string,
  rules: IgnoreRules,
  start = '',
  limit = MAX_PROJECT_FILES,
): Promise<ScanResult> {
  const files = new Map<string, ScannedFile>();
  let truncated = false;
  let level = [start];
  for (let depth = 0; level.length && depth <= MAX_DEPTH && !truncated; depth += 1) {
    const next: string[] = [];
    const candidates: string[] = [];
    await eachLimited(level, STAT_CONCURRENCY, async (dir) => {
      await rules.enter(dir);
      const entries = await readdir(absolutePath(root, dir), { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
        // Names that cannot be a project path (control characters, ':' streams…) are skipped.
        if (!isProjectPath(path)) continue;
        // Dirent types come from lstat semantics: links and junctions are neither.
        if (entry.isDirectory()) {
          if (!rules.ignored(path, true, false)) next.push(path);
        } else if (entry.isFile() && !rules.ignored(path, false, false)) {
          candidates.push(path);
        }
      }
    });
    candidates.sort();
    if (files.size + candidates.length > limit) {
      candidates.length = Math.max(0, limit - files.size);
      truncated = true;
    }
    await eachLimited(candidates, STAT_CONCURRENCY, async (path) => {
      const file = await statFile(root, path);
      if (file) files.set(path, file);
    });
    level = next.sort();
  }
  if (level.length && !truncated) truncated = true;
  return { files, truncated };
}
