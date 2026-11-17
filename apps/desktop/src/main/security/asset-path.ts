// Maps an app:// URL path to a file of the built renderer, refusing anything outside it
// (path traversal, encoded separators, NUL bytes, symlinks that point elsewhere).
import { realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export interface AssetFs {
  /** Must throw for missing paths. */
  realpath(p: string): string;
  isFile(p: string): boolean;
}

const nodeFs: AssetFs = {
  realpath: (p) => realpathSync(p),
  isFile: (p) => statSync(p).isFile(),
};

/**
 * Returns the absolute path of the requested asset, or null when the path is not a regular file
 * inside `root`. The file system is injectable for tests.
 */
export function resolveAssetPath(
  root: string,
  urlPathname: string,
  fs: AssetFs = nodeFs,
): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const rel = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  const rootAbs = resolve(root);
  const target = resolve(rootAbs, rel);
  if (!isInside(rootAbs, target)) return null;

  try {
    const realRoot = fs.realpath(rootAbs);
    const realTarget = fs.realpath(target);
    if (!isInside(realRoot, realTarget)) return null;
    if (!fs.isFile(realTarget)) return null;
  } catch {
    return null;
  }
  return target;
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeTypeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}
