// Maps raw imports to workspace files. The resolver is pure: it sees the file list and the
// project configuration, never the disk, so the indexer can re-resolve every file cheaply when
// files appear or disappear.
import { posix } from 'node:path';
import { inside, type ProjectConfig, type WorkspacePackage } from './config.ts';
import type { RawImport } from './languages.ts';

export interface Resolved {
  imports: string[];
  importDirs: string[];
  externals: string[];
}

const JS_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const JS_EXTENSION_ALIASES: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

const parentDir = (path: string) => {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
};
const join = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);

/** Every directory that contains at least one listed file, with its ancestors. */
export function directoriesOf(files: Iterable<string>): Set<string> {
  const dirs = new Set<string>();
  for (const file of files) {
    for (let dir = parentDir(file); dir !== '' && !dirs.has(dir); dir = parentDir(dir)) {
      dirs.add(dir);
    }
  }
  return dirs;
}

export class Resolver {
  private readonly dirs: Set<string>;
  private readonly goDirs: Set<string>;
  private readonly packages: WorkspacePackage[];

  private readonly files: ReadonlySet<string>;
  private readonly config: ProjectConfig;

  constructor(files: ReadonlySet<string>, config: ProjectConfig) {
    this.files = files;
    this.config = config;
    this.dirs = directoriesOf(files);
    this.goDirs = new Set(
      [...files].filter((file) => file.endsWith('.go')).map((file) => parentDir(file)),
    );
    // Longest names first, so `@scope/a-b` wins over `@scope/a`.
    this.packages = config.packages
      .filter((pkg) => pkg.name)
      .sort((a, b) => b.name.length - a.name.length);
  }

  resolve(from: string, raw: readonly RawImport[]): Resolved {
    const imports = new Set<string>();
    const importDirs = new Set<string>();
    const externals = new Set<string>();
    for (const item of raw) {
      switch (item.kind) {
        case 'js': {
          const found = this.resolveJs(from, item.spec);
          if (found) imports.add(found);
          else if (!item.spec.startsWith('.') && !item.spec.startsWith('/'))
            externals.add(packageName(item.spec));
          break;
        }
        case 'py': {
          const found = this.resolvePython(from, item.level, item.module, item.names);
          for (const file of found) imports.add(file);
          if (!found.length && item.level === 0 && item.module)
            externals.add(item.module.split('.')[0]!);
          break;
        }
        case 'go': {
          const dir = this.resolveGo(item.path);
          if (dir !== null) importDirs.add(dir);
          else externals.add(item.path);
          break;
        }
        case 'rs-mod': {
          const found = this.rustChild(rustModuleDir(from), item.name);
          if (found) imports.add(found);
          break;
        }
        case 'rs-use': {
          const found = this.resolveRustUse(from, item.path);
          if (found === undefined) externals.add(item.path[0]!);
          else if (found) imports.add(found);
          break;
        }
        case 'rs-crate':
          externals.add(item.name);
          break;
      }
    }
    imports.delete(from);
    return {
      imports: [...imports].sort(),
      importDirs: [...importDirs].sort(),
      externals: [...externals].filter((name) => name.length <= 200).sort(),
    };
  }

  // ── TS/JS ────────────────────────────────────────────────────────────────

  private file(candidate: string | null): string | null {
    return candidate !== null && candidate !== '' && this.files.has(candidate) ? candidate : null;
  }

  /** A path as written, with the extensions and index files TS and bundlers try. */
  private jsCandidate(target: string | null): string | null {
    if (target === null) return null;
    const exact = this.file(target);
    if (exact) return exact;
    const ext = posix.extname(target);
    for (const alias of JS_EXTENSION_ALIASES[ext] ?? []) {
      const found = this.file(target.slice(0, -ext.length) + alias);
      if (found) return found;
    }
    for (const extension of JS_EXTENSIONS) {
      const found = this.file(target + extension);
      if (found) return found;
    }
    if (target === '' || this.dirs.has(target)) {
      for (const extension of JS_EXTENSIONS) {
        const found = this.file(join(target, `index${extension}`));
        if (found) return found;
      }
    }
    return null;
  }

  private resolveJs(from: string, spec: string): string | null {
    if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
      return this.jsCandidate(inside(parentDir(from), spec));
    }
    if (spec.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(spec)) return null;
    for (const { pattern, targets } of this.config.aliases) {
      const star = pattern.indexOf('*');
      let rest: string | null = null;
      if (star < 0) rest = spec === pattern ? '' : null;
      else if (
        spec.startsWith(pattern.slice(0, star)) &&
        spec.endsWith(pattern.slice(star + 1)) &&
        spec.length >= pattern.length - 1
      )
        rest = spec.slice(star, spec.length - (pattern.length - star - 1));
      if (rest === null) continue;
      for (const target of targets) {
        const found = this.jsCandidate(inside('', target.replace('*', rest)));
        if (found) return found;
      }
    }
    const pkg = this.packages.find((p) => spec === p.name || spec.startsWith(`${p.name}/`));
    if (pkg) {
      const subpath = spec === pkg.name ? '.' : `.${spec.slice(pkg.name.length)}`;
      const target = pkg.exports.get(subpath);
      const found =
        (target !== undefined && this.jsCandidate(inside(pkg.dir, target))) ||
        this.jsCandidate(inside(pkg.dir, subpath)) ||
        (subpath === '.' ? this.jsCandidate(inside(pkg.dir, 'src')) : null);
      if (found) return found;
    }
    if (this.config.baseUrl !== null) return this.jsCandidate(inside(this.config.baseUrl, spec));
    return null;
  }

  // ── Python ───────────────────────────────────────────────────────────────

  /** `a.b` under `base`: a/b.py, a/b.pyi or a/b/__init__.py. '' is the package of `base`. */
  private pythonModule(base: string, dotted: string): string | null {
    if (!dotted) return this.file(join(base, '__init__.py'));
    const path = join(base, dotted.split('.').join('/'));
    return (
      this.file(`${path}.py`) ?? this.file(`${path}.pyi`) ?? this.file(join(path, '__init__.py'))
    );
  }

  /** The deepest existing module of `a.b.c` (Python imports every parent package too). */
  private pythonDeepest(base: string, dotted: string): string | null {
    const parts = dotted.split('.');
    for (let take = parts.length; take > 0; take -= 1) {
      const found = this.pythonModule(base, parts.slice(0, take).join('.'));
      if (found) return found;
    }
    return null;
  }

  private resolvePython(from: string, level: number, module: string, names: string[]): string[] {
    let bases: string[];
    if (level > 0) {
      let base = parentDir(from);
      for (let up = 1; up < level; up += 1) {
        if (base === '') return [];
        base = parentDir(base);
      }
      bases = [base];
    } else {
      bases = ['', 'src'].filter((base) => base === '' || this.dirs.has(base));
    }
    for (const base of bases) {
      if (!names.length) {
        const found = this.pythonDeepest(base, module);
        if (found) return [found];
        continue;
      }
      const children = names.flatMap((name) => {
        const found = this.pythonModule(base, module ? `${module}.${name}` : name);
        return found ? [found] : [];
      });
      if (children.length === names.length) return children;
      // Names that are not submodules come from the module itself.
      const own = level || module ? this.pythonModule(base, module) : null;
      if (own) return [...children, own];
      if (children.length) return children;
    }
    return [];
  }

  // ── Go ───────────────────────────────────────────────────────────────────

  private resolveGo(path: string): string | null {
    let best: { path: string; dir: string } | null = null;
    for (const module of this.config.goModules) {
      if (path !== module.path && !path.startsWith(`${module.path}/`)) continue;
      if (!best || module.path.length > best.path.length) best = module;
    }
    if (!best) return null;
    const dir = inside(best.dir, path.slice(best.path.length + 1));
    return dir !== null && this.goDirs.has(dir) ? dir : null;
  }

  // ── Rust ─────────────────────────────────────────────────────────────────

  private rustChild(dir: string, name: string): string | null {
    return this.file(join(dir, `${name}.rs`)) ?? this.file(join(dir, `${name}/mod.rs`));
  }

  /** The crate source directory and module path of a Rust file, or null outside a crate. */
  private rustLocation(from: string): { src: string; module: string[] } | null {
    const crate = this.config.crates
      .filter((dir) => dir === '' || from.startsWith(`${dir}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (crate === undefined) return null;
    const src = join(crate, 'src');
    if (!from.startsWith(`${src}/`)) return null;
    const parts = from
      .slice(src.length + 1)
      .replace(/\.rs$/, '')
      .split('/');
    const last = parts.at(-1);
    if (last === 'mod' || (parts.length === 1 && (last === 'lib' || last === 'main'))) parts.pop();
    if (parts[0] === 'bin') return { src, module: [] };
    return { src, module: parts };
  }

  /** The workspace file a `use` path points at, null if inside but unknown, undefined if external. */
  private resolveRustUse(from: string, path: string[]): string | null | undefined {
    const location = this.rustLocation(from);
    if (!location) return undefined;
    let module: string[];
    let rest: string[];
    const [head, ...tail] = path;
    if (head === 'crate') {
      module = [];
      rest = tail;
    } else if (head === 'self' || head === 'super') {
      module = [...location.module];
      rest = path;
      while (rest[0] === 'self' || rest[0] === 'super') {
        if (rest[0] === 'super') module.pop();
        rest = rest.slice(1);
      }
    } else if (head && this.rustChild(rustModuleDir(from), head)) {
      // A child module declared in this file (2018 edition paths).
      module = [...location.module];
      rest = path;
    } else {
      return undefined;
    }
    for (let take = rest.length; take >= 0; take -= 1) {
      const target = [...module, ...rest.slice(0, take)];
      if (!target.length) {
        return this.file(join(location.src, 'lib.rs')) ?? this.file(join(location.src, 'main.rs'));
      }
      const parent = target.slice(0, -1);
      const dir = parent.length ? join(location.src, parent.join('/')) : location.src;
      const found = this.rustChild(dir, target.at(-1)!);
      if (found) return found;
    }
    return null;
  }
}

/** Where a Rust file's child modules live: next to it for lib/main/mod.rs, else in its stem. */
export function rustModuleDir(from: string): string {
  const dir = parentDir(from);
  const name = from.slice(from.lastIndexOf('/') + 1);
  return ['lib.rs', 'main.rs', 'mod.rs'].includes(name)
    ? dir
    : join(dir, name.replace(/\.rs$/, ''));
}

/** `@scope/pkg/sub` → `@scope/pkg`, `pkg/sub` → `pkg`, `node:fs` → `node:fs`. */
export function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}
