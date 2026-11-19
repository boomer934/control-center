// .gitignore semantics for the scan: the root .gitignore and .git/info/exclude, plus one
// .gitignore per directory, each relative to its own folder. Like Git, an ignored directory is
// never entered, so a negated pattern cannot bring back a file below it. The user's global
// excludes file is not read: the model must not depend on the user's Git configuration.
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { realDirectory } from './scan.ts';

/** Never part of the model, with or without a .gitignore. */
const ALWAYS_IGNORED = new Set(['.git', 'node_modules']);
const MAX_IGNORE_FILE_BYTES = 256 * 1024;

async function readSmallFile(path: string): Promise<string | null> {
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile() || info.size > MAX_IGNORE_FILE_BYTES) return null;
  return readFile(path, 'utf8').catch(() => null);
}

export const isIgnoreFile = (path: string) => path === '.gitignore' || path.endsWith('/.gitignore');

export class IgnoreRules {
  /** Directory (relative, '' for the root) → its matcher. */
  private readonly layers = new Map<string, Ignore>();

  private readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  static async load(root: string): Promise<IgnoreRules> {
    const rules = new IgnoreRules(root);
    const exclude = (await realDirectory(root, '.git/info'))
      ? await readSmallFile(join(root, '.git', 'info', 'exclude'))
      : null;
    const own = await readSmallFile(join(root, '.gitignore'));
    if (exclude !== null || own !== null) {
      rules.layers.set(
        '',
        ignore()
          .add(exclude ?? '')
          .add(own ?? ''),
      );
    }
    return rules;
  }

  /** Reads `<dir>/.gitignore`, if any. The root's is read by `load`. */
  async enter(dir: string): Promise<void> {
    if (dir === '' || this.layers.has(dir)) return;
    const text = await readSmallFile(join(this.root, ...dir.split('/'), '.gitignore'));
    if (text !== null) this.layers.set(dir, ignore().add(text));
  }

  /**
   * `ancestors: false` skips the parent directories, for the scan, which only asks about
   * entries of directories it already accepted. The watcher reports paths anywhere in the tree,
   * so it checks them all.
   */
  ignored(path: string, directory: boolean, ancestors = true): boolean {
    const parts = path.split('/');
    if (parts.some((part) => ALWAYS_IGNORED.has(part))) return true;
    if (this.matches(path, directory)) return true;
    if (!ancestors) return false;
    for (let end = parts.length - 1; end > 0; end -= 1) {
      if (this.matches(parts.slice(0, end).join('/'), true)) return true;
    }
    return false;
  }

  private matches(path: string, directory: boolean): boolean {
    const candidate = directory ? `${path}/` : path;
    let ignored = this.layers.get('')?.ignores(candidate) ?? false;
    for (let end = path.indexOf('/'); end !== -1; end = path.indexOf('/', end + 1)) {
      const result = this.layers.get(path.slice(0, end))?.test(candidate.slice(end + 1));
      if (result?.ignored) ignored = true;
      else if (result?.unignored) ignored = false;
    }
    return ignored;
  }
}
