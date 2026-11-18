import { lstat, realpath, stat } from 'node:fs/promises';
import { win32 as path } from 'node:path';

declare const canonicalRoot: unique symbol;
export type WorkspaceRoot = string & { readonly [canonicalRoot]: true };

interface WorkspaceFs {
  realpath(path: string): Promise<string>;
  isDirectory(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  sameDirectory(first: string, second: string): Promise<boolean>;
}

const nodeFs: WorkspaceFs = {
  realpath,
  isDirectory: async (file) => (await stat(file)).isDirectory(),
  isFile: async (file) => (await stat(file)).isFile(),
  async sameDirectory(first, second) {
    const [left, right] = await Promise.all([
      lstat(first, { bigint: true }),
      lstat(second, { bigint: true }),
    ]);
    return (
      left.isDirectory() &&
      right.isDirectory() &&
      left.ino !== 0n &&
      left.ino === right.ino &&
      left.dev === right.dev
    );
  },
};

const DRIVE_ROOT = /^[a-z]:\\/i;
const UNC_ROOT = /^\\\\([^\\]+)\\([^\\]+)(?:\\|$)/;
const DEVICE_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])(?:[. ]|$)/i;
// eslint-disable-next-line no-control-regex -- Win32 also reserves ASCII control characters.
const INVALID_FILENAME_CHARS = /[<>:"|?*\u0000-\u001f]/u;

export function isPlainSegment(segment: string): boolean {
  return (
    !INVALID_FILENAME_CHARS.test(segment) && !/[. ]$/.test(segment) && !DEVICE_NAME.test(segment)
  );
}

/** Accept normal drive, UNC and relative paths. Reject ambiguous Win32 aliases before I/O. */
function parsePath(input: string): { value: string; absolute: boolean } | null {
  if (!input) return null;
  const value = input.replaceAll('/', '\\');
  const drive = DRIVE_ROOT.test(value);
  const unc = UNC_ROOT.exec(value);
  if (unc && !unc.slice(1).every(isPlainSegment)) return null;
  if (value.startsWith('\\') && !unc) return null;

  const volumeLength = drive ? 3 : (unc?.[0].length ?? 0);
  const segments = value.slice(volumeLength).split('\\');
  if (segments.some((segment) => segment !== '.' && segment !== '..' && !isPlainSegment(segment))) {
    return null;
  }
  return { value, absolute: drive || unc !== null };
}

function absolutePath(input: string): string | null {
  const parsed = parsePath(input);
  return parsed?.absolute ? path.resolve(parsed.value) : null;
}

/** Call for a folder chosen in the native dialog before making it an active workspace. */
export async function resolveWorkspaceRoot(
  selected: string,
  fs: WorkspaceFs = nodeFs,
): Promise<WorkspaceRoot | null> {
  const directory = absolutePath(selected);
  if (!directory) return null;

  try {
    const canonical = absolutePath(await fs.realpath(directory));
    return canonical && (await fs.isDirectory(canonical)) ? (canonical as WorkspaceRoot) : null;
  } catch {
    return null;
  }
}

function relativeChild(root: string, candidate: string): string | null {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith('..\\') || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

async function isCanonicalChild(
  root: WorkspaceRoot,
  file: string,
  fs: WorkspaceFs,
): Promise<boolean> {
  const relative = relativeChild(root, file);
  if (!relative) return false;

  const prefix = root.endsWith('\\') ? root : root + '\\';
  if (file.startsWith(prefix)) return true;

  // realpath can preserve case. Compare directory identities before accepting a case alias
  // so a different case-sensitive sibling is still outside the workspace.
  const ancestor = relative.split('\\').reduce((directory) => path.dirname(directory), file);
  return fs.sameDirectory(root, ancestor);
}

/** Return only an existing, regular file whose canonical path is inside the selected root. */
export async function resolveWorkspaceFile(
  root: WorkspaceRoot,
  input: string,
  fs: WorkspaceFs = nodeFs,
): Promise<string | null> {
  const parsed = parsePath(input);
  if (!parsed) return null;
  const candidate = path.resolve(root, parsed.value);
  if (!relativeChild(root, candidate)) return null;

  try {
    const canonical = absolutePath(await fs.realpath(candidate));
    if (
      !canonical ||
      !(await isCanonicalChild(root, canonical, fs)) ||
      !(await fs.isFile(canonical))
    ) {
      return null;
    }
    return canonical;
  } catch {
    return null;
  }
}
