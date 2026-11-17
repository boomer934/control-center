// V8 stack trace parsing. Frames get a project-relative path and a kind (project / dependency /
// internal) so the Console can highlight our own code and collapse the rest. Absolute paths
// outside the project never survive: they are masked (home → `~`) or shortened.
import type { FrameKind, StackFrame } from './types';

const MAX_FRAMES = 60;
const DRIVE = /^[A-Za-z]:\//;
const HOME = /^(?:[A-Za-z]:\/Users\/[^/]+|\/(?:home|Users)\/[^/]+)(?=\/|$)/i;

const slashes = (p: string) => p.replace(/\\+/g, '/');

/** Turns a `file://` URL into a path; leaves every other string alone. */
function fromFileUrl(raw: string): string {
  if (!raw.startsWith('file://')) return raw;
  let path = raw.slice('file://'.length);
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the encoded form
  }
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

/**
 * Normalizes the file part of a frame. `projectRoot` is the repository (or app) root: files under
 * it become relative. Sources of a packaged build live on the build machine, so `apps/…` and
 * `packages/…` are recognised by shape.
 */
export function normalizeFile(raw: string, projectRoot: string): string {
  let file = slashes(fromFileUrl(raw.trim()));
  // dev server frames carry a cache-busting query string
  file = file.replace(/\?[^/]*$/, '');
  if (/^(?:node:|electron\/|<anonymous>|native )/.test(file) || file === '') return file;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return file; // app://, http://: not on disk

  const nm = file.lastIndexOf('/node_modules/');
  if (nm >= 0) return file.slice(nm + 1);

  const root = slashes(projectRoot).replace(/\/+$/, '');
  const cmp = (s: string) => (DRIVE.test(s) ? s.toLowerCase() : s);
  if (root && (cmp(file) === cmp(root) || cmp(file).startsWith(`${cmp(root)}/`))) {
    return file.slice(root.length + 1);
  }
  const shaped = /\/((?:apps|packages)\/[^/]+\/(?:src|e2e)\/.*)$/.exec(file);
  if (shaped?.[1]) return shaped[1];
  return file.replace(HOME, '~');
}

function kindOf(file: string): FrameKind {
  if (/^(?:node:|electron\/|<anonymous>|native )/.test(file) || file === '') return 'internal';
  if (file.startsWith('node_modules/') || file.includes('/node_modules/')) return 'dependency';
  return 'project';
}

// eslint-disable-next-line no-control-regex -- matching the ESC character is the whole point
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Removes terminal colour codes: Node colours the stack of a crash when its stderr is a TTY or FORCE_COLOR is set. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

const AT = /^\s*at\s+(?:async\s+)?(.*?)\s*$/;

/** Parses the `at …` lines of a V8 stack. Anything else (the message lines) is ignored. */
export function parseStack(stack: string, projectRoot: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of stripAnsi(stack).split(/\r?\n/)) {
    const at = AT.exec(line);
    if (!at?.[1]) continue;
    const body = at[1];
    let fn: string | null = null;
    let loc = body;
    const paren = /^(.*?)\s+\((.*)\)$/.exec(body);
    if (paren) {
      fn = paren[1] ?? null;
      loc = paren[2] ?? '';
    }
    const pos = /^(.*?):(\d+):(\d+)$/.exec(loc) ?? /^(.*?):(\d+)$/.exec(loc);
    const rawFile = pos ? (pos[1] ?? '') : loc;
    const file = normalizeFile(rawFile, projectRoot);
    frames.push({
      fn: fn && fn.length > 0 ? fn : null,
      file,
      line: pos?.[2] ? Number(pos[2]) : null,
      column: pos?.[3] ? Number(pos[3]) : null,
      kind: kindOf(file),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames;
}

const HEAD = /^\s*((?:[A-Za-z_$][\w$]*\.)*[\w$]*(?:Error|Exception))(?::\s*(.*))?$/;

/**
 * Finds `Name: message` in raw error text (the stderr of a crashed child: a source excerpt, the
 * error line, the stack, the runtime version). Falls back to the first non-empty line.
 */
export function parseErrorHead(text: string): { name: string; message: string } {
  const lines = stripAnsi(text).split(/\r?\n/);
  for (const line of lines) {
    const m = HEAD.exec(line);
    if (m?.[1]) return { name: m[1], message: m[2] ?? '' };
  }
  const first = lines.find((l) => l.trim() !== '') ?? '';
  return { name: 'Error', message: first.trim() };
}

/** Name, message and stack of anything that was thrown. */
export function describeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  }
  let message: string;
  try {
    message = typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    message = String(err);
  }
  return { name: 'NonError', message: message ?? 'undefined' };
}
