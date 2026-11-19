// Project configuration that changes how imports resolve: TS/JS path aliases, packages of a
// monorepo, Go modules and Rust crates. Everything is parsed from text the indexer reads; a file
// that does not parse is ignored, never an error.
import { posix } from 'node:path';

export interface PathAlias {
  /** Pattern with at most one `*`. */
  pattern: string;
  /** Targets relative to the workspace root, each with at most one `*`. */
  targets: string[];
}

export interface WorkspacePackage {
  name: string;
  /** Package directory relative to the root ('' for the root package). */
  dir: string;
  /** Subpath ('.', './x') → target relative to the package directory. */
  exports: Map<string, string>;
  dependencies: string[];
}

export interface ProjectConfig {
  aliases: PathAlias[];
  /** Directory for bare specifiers when `baseUrl` is set. */
  baseUrl: string | null;
  packages: WorkspacePackage[];
  /** Go module path → module directory. */
  goModules: { path: string; dir: string }[];
  /** Rust crate directories (where Cargo.toml is). */
  crates: string[];
}

export const emptyConfig = (): ProjectConfig => ({
  aliases: [],
  baseUrl: null,
  packages: [],
  goModules: [],
  crates: [],
});

const MAX_ALIASES = 200;

/** JSON with comments and trailing commas, as tsconfig.json allows. */
export function parseJsonc(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '"') {
      const start = i;
      for (i += 1; i < text.length && text[i] !== '"'; i += 1) if (text[i] === '\\') i += 1;
      out += text.slice(start, i + 1);
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else {
      out += char;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Joins a config-relative target onto the workspace, or null if it leaves the workspace. */
export function inside(base: string, target: string): string | null {
  const joined = posix.normalize(posix.join(base, target.replace(/\\/g, '/')));
  if (joined === '.' || joined === './') return '';
  if (joined.startsWith('../') || joined === '..' || posix.isAbsolute(joined)) return null;
  return joined.replace(/^\.\//, '').replace(/\/$/, '');
}

/** compilerOptions.paths and baseUrl of the root tsconfig.json or jsconfig.json. */
export function parseTsconfig(text: string, config: ProjectConfig): void {
  const json = parseJsonc(text);
  const options = isRecord(json) && isRecord(json.compilerOptions) ? json.compilerOptions : null;
  if (!options) return;
  const baseUrl = typeof options.baseUrl === 'string' ? inside('', options.baseUrl) : null;
  config.baseUrl = baseUrl;
  if (!isRecord(options.paths)) return;
  for (const [pattern, targets] of Object.entries(options.paths)) {
    if (config.aliases.length >= MAX_ALIASES || pattern.split('*').length > 2) continue;
    if (!Array.isArray(targets)) continue;
    const resolved = targets.flatMap((target) => {
      if (typeof target !== 'string' || target.split('*').length > 2) return [];
      const joined = inside(baseUrl ?? '', target);
      return joined === null ? [] : [joined];
    });
    if (resolved.length) config.aliases.push({ pattern, targets: resolved });
  }
}

/** First string in an `exports` condition object, preferring sources and types. */
function exportTarget(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return value;
  if (!isRecord(value) || depth > 4) return null;
  for (const key of ['source', 'types', 'import', 'module', 'default', 'require', 'node']) {
    const found = exportTarget(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

export function parsePackageJson(text: string, dir: string, config: ProjectConfig): void {
  const json = parseJsonc(text);
  if (!isRecord(json)) return;
  const dependencies = ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((key) =>
    isRecord(json[key]) ? Object.keys(json[key]) : [],
  );
  const name = typeof json.name === 'string' && json.name.length <= 214 ? json.name : null;
  const exports = new Map<string, string>();
  const field = json.exports;
  if (typeof field === 'string' || (isRecord(field) && !Object.keys(field)[0]?.startsWith('.'))) {
    const target = exportTarget(field);
    if (target) exports.set('.', target);
  } else if (isRecord(field)) {
    for (const [subpath, value] of Object.entries(field)) {
      const target = exportTarget(value);
      if (target && subpath.startsWith('.')) exports.set(subpath, target);
    }
  }
  if (!exports.has('.')) {
    for (const key of ['source', 'types', 'module', 'main']) {
      if (typeof json[key] === 'string') {
        exports.set('.', json[key]);
        break;
      }
    }
  }
  config.packages.push({ name: name ?? '', dir, exports, dependencies });
}

export function parseGoMod(text: string, dir: string, config: ProjectConfig): void {
  const match = /^\s*module\s+("?)([^\s"]+)\1\s*$/m.exec(text);
  if (match?.[2]) config.goModules.push({ path: match[2], dir });
}

export function addCrate(dir: string, config: ProjectConfig): void {
  config.crates.push(dir);
}

/** The configuration files the indexer reads, by role. */
export function configKind(path: string): 'tsconfig' | 'package' | 'go-mod' | 'cargo' | null {
  if (path === 'tsconfig.json' || path === 'jsconfig.json') return 'tsconfig';
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name === 'package.json') return 'package';
  if (name === 'go.mod') return 'go-mod';
  if (name === 'Cargo.toml') return 'cargo';
  return null;
}
