// Stack trace parsers (phase 5e): from the text a process printed to `error.detected` drafts. The
// parsers form a registry (one module per language, with fixtures in packages/fixtures/stacks);
// this module prepares the text (ANSI codes, carriage returns, Docker Compose prefixes), runs
// them, keeps one reading per line and maps raw paths to workspace FileRefs.
import { makeTextCleaner, toFileRef, type FileRef } from '../path';
import { MAX_ERROR_FRAMES, type DetectedError, type ErrorOrigin, type StackFrame } from '../schema';
import { goParser } from './go';
import { javascriptParser } from './javascript';
import { pythonParser } from './python';
import { rustParser } from './rust';
import type { Found, RawFrame, StackParser } from './types';

export type { Found, RawError, RawFrame, StackParser } from './types';

/** Order matters on ties: a Rust backtrace (`at file:1`) must not read as a V8 stack. */
export const STACK_PARSERS: readonly StackParser[] = [
  rustParser,
  pythonParser,
  goParser,
  javascriptParser,
];

/** Output scanned at most, from the end: a trace is printed last. */
export const MAX_SCAN_CHARS = 256 * 1024;
export const MAX_ERRORS_PER_SCAN = 20;

export type ErrorDraft = DetectedError;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[([0-?]*)[ -/]*([@-~])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

/**
 * Terminal escapes out. A pseudo console (ConPTY) draws the screen with cursor moves instead of
 * line breaks and spaces: a move to another row is a line break, a move right is spaces.
 */
function stripEscapes(text: string): string {
  return text.replace(ANSI, (_all, params: string | undefined, final: string | undefined) => {
    if (final === 'H' || final === 'f' || final === 'B' || final === 'E') return '\n';
    if (final === 'C') return ' '.repeat(Math.min(200, Number(params) || 1));
    return '';
  });
}

/** Characters of a line the parsers look at. */
export const MAX_LINE_CHARS = 2000;

/** `api-1  | ` (Compose v2) or `api_1  | ` (v1). */
const COMPOSE_PREFIX = /^[a-z0-9][\w.-]*[-_]\d+\s+\| ?/i;

/** Lines without terminal escapes, and whether they came from `docker compose` logs. */
export function prepareLines(text: string): { lines: string[]; docker: boolean } {
  let docker = false;
  const lines = stripEscapes(text.slice(-MAX_SCAN_CHARS))
    .split(/\r?\n/)
    .map((line) => {
      const cr = line.lastIndexOf('\r');
      // No frame is this long: the cut keeps every parser linear on minified or binary output.
      const visible = (cr >= 0 ? line.slice(cr + 1) : line).slice(0, MAX_LINE_CHARS);
      const prefix = COMPOSE_PREFIX.exec(visible);
      if (!prefix) return visible;
      docker = true;
      return visible.slice(prefix[0].length);
    });
  return { lines, docker };
}

/** Every error of the registry, one per line range, in output order. */
export function findErrors(lines: readonly string[]): Found[] {
  const all = STACK_PARSERS.flatMap((parser, rank) =>
    parser.find(lines).map((found) => ({ found, rank })),
  );
  all.sort(
    (a, b) =>
      a.found.start - b.found.start ||
      b.found.end - b.found.start - (a.found.end - a.found.start) ||
      a.rank - b.rank,
  );
  const out: Found[] = [];
  let reached = 0;
  for (const { found } of all) {
    if (found.start < reached) continue;
    out.push(found);
    reached = found.end;
  }
  return out;
}

/** Paths of dependencies, toolchains and standard libraries: never the culprit. */
const DEPENDENCY =
  /(?:^|\/)(?:node_modules|site-packages|dist-packages|\.venv|venv|vendor|\.cargo|\.rustup|\.vite)\/|^\/rustc\/|(?:^|\/)(?:usr\/(?:local\/)?lib|lib\/python\d|Lib|go\/src|pkg\/mod)\//;

/** `scheme://host/path?query#hash` → the decoded path (the package has no `URL` type). */
const URL_PATH = /^([a-z][\w+.-]*):\/\/[^/?#]*(\/[^?#]*)?/i;

/** A frame path as a file path: URLs become their path, `file://` URLs a local path. */
function filePath(raw: string): string | undefined {
  const url = URL_PATH.exec(raw);
  if (!url) return raw;
  let path: string;
  try {
    path = decodeURIComponent(url[2] ?? '');
  } catch {
    return undefined;
  }
  const scheme = url[1]!.toLowerCase();
  if (scheme === 'file') return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path || undefined;
  if (scheme !== 'http' && scheme !== 'https') return undefined;
  // Vite serves files outside the root as /@fs/<absolute path>.
  if (path.startsWith('/@fs/')) return path.slice('/@fs'.length).replace(/^\/([A-Za-z]:)/, '$1');
  return path.replace(/^\/+/, '') || undefined;
}

function toFrame(cwd: string, raw: RawFrame): StackFrame | undefined {
  const path = filePath(raw.path);
  if (!path) return undefined;
  let file: FileRef;
  try {
    file = toFileRef(cwd, path);
  } catch {
    return undefined;
  }
  return {
    file,
    ...(raw.line ? { line: raw.line } : {}),
    ...(raw.column ? { column: raw.column } : {}),
    ...(raw.fn ? { fn: raw.fn } : {}),
  };
}

export interface DetectOptions {
  /** Workspace root the output paths are relative to. */
  cwd: string;
  origin: ErrorOrigin;
  toolUseId?: string;
}

/**
 * The errors in a piece of output, as `error.detected` drafts (no envelope). The culprit `file`
 * is the frame closest to the failure outside dependencies: in the workspace when there is one,
 * otherwise outside it (`external`: a container path the map can still match by its suffix).
 */
export function detectErrors(text: string, options: DetectOptions): ErrorDraft[] {
  if (!text) return [];
  const clean = makeTextCleaner(options.cwd);
  const { lines, docker } = prepareLines(text);
  const origin: ErrorOrigin = docker && options.origin === 'terminal' ? 'docker' : options.origin;
  return findErrors(lines)
    .slice(-MAX_ERRORS_PER_SCAN)
    .map(({ error }) => {
      const frames = error.frames
        .map((raw) => toFrame(options.cwd, raw))
        .filter((f): f is StackFrame => f !== undefined);
      const own = frames.filter((f) => !DEPENDENCY.test(f.file.path));
      const culprit = own.find((f) => !f.file.external) ?? own[0];
      const message = clean(error.message).slice(0, 500) || error.language;
      return {
        origin,
        language: error.language,
        message,
        ...(culprit
          ? {
              file: culprit.file,
              ...(culprit.line ? { line: culprit.line } : {}),
              ...(culprit.column ? { column: culprit.column } : {}),
            }
          : {}),
        frames: frames.slice(0, MAX_ERROR_FRAMES),
        ...(options.toolUseId ? { toolUseId: options.toolUseId } : {}),
      };
    });
}

const DEV_SERVER_COMMAND =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve)\b|vite(?:\s|$)|next\s+dev|nuxt\s+dev|astro\s+dev|uvicorn|flask\s+run|manage\.py\s+runserver|nodemon|air\b)/i;
const TEST_COMMAND =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|vitest|jest|mocha|pytest|playwright\s+test|cargo\s+test|go\s+test|node\s+--test)\b/i;

/** Origin of the output of an agent's shell command, from the command line. */
export function originOfCommand(command: string | null | undefined): ErrorOrigin {
  if (!command) return 'command';
  if (/^\s*(?:docker|podman)\b/i.test(command)) return 'docker';
  if (TEST_COMMAND.test(command)) return 'test';
  if (DEV_SERVER_COMMAND.test(command)) return 'dev-server';
  return 'command';
}

/** Banners of development servers: a terminal that prints one runs a dev server from then on. */
export const DEV_SERVER_BANNER =
  /\bVITE v\d|\bready in \d+\s?ms|\bLocal:\s+https?:\/\/|ready - started server|started server on|Uvicorn running on|Running on https?:\/\/|webpack compiled|Compiled successfully|Server (?:is )?(?:running|listening) (?:at|on)|Listening on (?:port )?:?\d+/i;
