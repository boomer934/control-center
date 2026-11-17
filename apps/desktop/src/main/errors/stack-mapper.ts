// Turns the frames of a stack that point into the build (`out/`) into the TypeScript sources they
// were compiled from.
//
// Electron's `process.setSourceMapsEnabled` does not rewrite `error.stack` in the main process, and
// the renderer runs bundled code from app://control-center/assets/*.js, so a raw stack says
// "index-ab12.js:1:48213". The build writes source maps next to the bundles; this module reads them
// with Node's own SourceMap and rewrites the frames. Map files are found through `resolveAssetPath`
// rooted at `out/`, so a crafted frame cannot make the main process read anything outside the
// build. In development the renderer comes from the Vite dev server, whose module URLs already
// mirror the source tree.
import { readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAssetPath } from '../security/asset-path';

export interface StackMapperOptions {
  /** `out/`: the electron-vite output (main, preload and renderer bundles with their maps). */
  builtRoot: string;
  /** `src/renderer`, the Vite root of the renderer sources, for dev-server frames. */
  rendererSourceRoot: string;
  /** Origin of the dev server when running in development. */
  devOrigin: string | null;
  /** Reads a map file; injectable for tests. Returns null when it is not available. */
  readMap?: (absolutePath: string) => string | null;
}

/** `at fn (location:line:col)` or `at location:line:col`. */
const FRAME = /^(\s*at\s+(?:async\s+)?)(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;

function defaultReadMap(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

interface LoadedMap {
  map: SourceMap;
  mapFile: string;
}

export function createStackMapper(options: StackMapperOptions) {
  const readMap = options.readMap ?? defaultReadMap;
  const builtRoot = resolve(options.builtRoot);
  const cache = new Map<string, LoadedMap | null>();

  /** The map of a built file, given its path relative to `out/`. */
  function loadMap(builtRelative: string): LoadedMap | null {
    if (cache.has(builtRelative)) return cache.get(builtRelative) ?? null;
    let loaded: LoadedMap | null = null;
    const mapFile = resolveAssetPath(builtRoot, `${builtRelative}.map`);
    const text = mapFile ? readMap(mapFile) : null;
    if (mapFile && text) {
      try {
        loaded = { map: new SourceMap(JSON.parse(text)), mapFile };
      } catch {
        loaded = null;
      }
    }
    if (cache.size > 50) cache.clear();
    cache.set(builtRelative, loaded);
    return loaded;
  }

  function original(loaded: LoadedMap, line: number, column: number) {
    const entry = loaded.map.findEntry(line - 1, column - 1);
    if (!('originalSource' in entry) || typeof entry.originalSource !== 'string') return null;
    const source = entry.originalSource;
    const file = source.startsWith('file:')
      ? fileURLToPath(source)
      : resolve(dirname(loaded.mapFile), source);
    return { file, line: entry.originalLine + 1, column: entry.originalColumn + 1 };
  }

  function mapFrame(text: string): string {
    const m = FRAME.exec(text);
    if (!m) return text;
    const [, prefix = '', fn, location = '', lineNo = '0', colNo = '0'] = m;
    const line = Number(lineNo);
    const column = Number(colNo);
    const render = (file: string, l: number, c: number) =>
      fn ? `${prefix}${fn} (${file}:${l}:${c})` : `${prefix}${file}:${l}:${c}`;

    // Renderer bundle served by the app protocol.
    if (location.startsWith('app://')) {
      let pathname: string;
      try {
        pathname = new URL(location).pathname;
      } catch {
        return text;
      }
      const loaded = loadMap(`renderer${pathname}`);
      const o = loaded && original(loaded, line, column);
      return o ? render(o.file, o.line, o.column) : text;
    }

    // Vite dev server module.
    if (/^https?:\/\//.test(location)) {
      if (!options.devOrigin) return text;
      try {
        const url = new URL(location);
        if (url.origin !== options.devOrigin) return text;
        const file = resolve(options.rendererSourceRoot, `.${decodeURIComponent(url.pathname)}`);
        return render(file, line, column);
      } catch {
        return text;
      }
    }

    // A built file on disk (the main process bundle, the preload).
    let path: string;
    try {
      path = location.startsWith('file://') ? fileURLToPath(location) : location;
    } catch {
      return text;
    }
    if (!isAbsolute(path)) return text;
    const rel = relative(builtRoot, path);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return text;
    const loaded = loadMap(rel.replace(/\\/g, '/'));
    const o = loaded && original(loaded, line, column);
    return o ? render(o.file, o.line, o.column) : text;
  }

  return {
    /** Same stack, with every frame of a built file replaced by its original location. */
    map(stack: string): string {
      return stack.split('\n').map(mapFrame).join('\n');
    },
  };
}
