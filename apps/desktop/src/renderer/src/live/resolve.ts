// Which project file an error's culprit is (phase 5e). Runtimes print paths relative to where
// they ran (a Rust crate in `rs/` prints `src/stock.rs`) or to a container (`/app/app/main.py`):
// a path the project does not have is matched by its suffix, only when the match is unique.
import type { FileRef } from '@control-center/event-schema';
import type { ResolveFile } from './activity';

/** Shortest suffix (in path segments) that may name a file outside the workspace. */
const MIN_EXTERNAL_SEGMENTS = 2;

export function makeResolveFile(paths: ReadonlyMap<string, unknown>): ResolveFile {
  return (file: FileRef) => {
    if (!file.external && (paths.size === 0 || paths.has(file.path))) return file.path;
    const segments = file.path.split('/').filter((s) => s && s !== '~');
    const shortest = file.external ? MIN_EXTERNAL_SEGMENTS : segments.length;
    for (let k = segments.length; k >= shortest && k > 0; k--) {
      const suffix = segments.slice(-k).join('/');
      let match: string | undefined;
      let count = 0;
      for (const path of paths.keys())
        if (path === suffix || path.endsWith(`/${suffix}`)) {
          match = path;
          if (++count > 1) return undefined;
        }
      if (match) return match;
    }
    return undefined;
  };
}
