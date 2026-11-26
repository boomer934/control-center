// Node, TypeScript and browser errors: V8 stacks (`    at fn (file:1:2)`), Firefox stacks
// (`fn@url:1:2`, or the devtools copy `    fn url:1`), tsc diagnostics and esbuild/Vite errors.
// A V8 or Firefox stack whose frames are URLs is a browser error.
import { lineBefore, toInt, type Found, type RawFrame, type StackParser } from './types';

const V8_FRAME = /^\s+at (?:(?:async )?(.+?) \((.+?)\)|(?:async )?(.+))$/;
const LOCATION = /^(.+?):(\d+)(?::(\d+))?$/;
const FIREFOX_AT = /^\s*([^\s@]*)@(.+?):(\d+)(?::(\d+))?\s*$/;
const FIREFOX_COPY = /^\s+(\S+) (https?:\/\/\S+?):(\d+)(?::(\d+))?\s*$/;
const TSC = /^(\S[^(]*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const TSC_PRETTY = /^(\S.*?):(\d+):(\d+) - error (TS\d+): (.*)$/;
const ESBUILD = /^(\S.*?\.(?:[cm]?[jt]sx?|vue|svelte|css|json)):(\d+):(\d+): ERROR: (.*)$/;
/** Oxc and Rolldown (Vite 8) diagnostics: `[PARSE_ERROR] Unexpected token`, then `╭─[ f:3:13 ]`. */
const OXC_HEAD = /^\s*\[([A-Z][A-Z0-9_]+)\]\s+(\S.*)$/;
const OXC_AT = /^\s*[╭┌]─*\[\s*(.+?):(\d+):(\d+)\s*\]/;

/** Frames that name no file of anybody's: runtime internals, eval, native code. */
const NOT_A_FILE = /^(?:node:|internal\/|\[eval|<anonymous>|native|wasm:|evalmachine)/;

function frameAt(fn: string | undefined, location: string): RawFrame | undefined {
  const m = LOCATION.exec(location.trim());
  if (!m || NOT_A_FILE.test(m[1]!)) return undefined;
  const name = fn?.trim();
  return {
    path: m[1]!,
    line: toInt(m[2]),
    ...(m[3] ? { column: toInt(m[3]) } : {}),
    ...(name && name !== '<anonymous>' ? { fn: name.slice(0, 200) } : {}),
  };
}

const ERROR_HEAD = /^\s*(?:Uncaught\s+)?[A-Z]\w*(?:Error|Exception)\b/;

const isUrl = (path: string) => /^https?:\/\//.test(path);
const header = (line: string) => line.trim().replace(/^Uncaught (?:\(in promise\) )?/, '');

/** Lines that print details, not the error: Vite's `Plugin:` / `File:`, box drawing. */
const DETAIL = /^\s*(?:File|Plugin|Location|Code):\s|^[^A-Za-z]*$/;
const SOME_ERROR = /\berror\b/i;
/** `12:01:33 [vite] Internal server error: …` → `Internal server error: …`. */
const cleanHead = (line: string) =>
  header(line.replace(/^\s*(?:\d{1,2}:\d{2}:\d{2}\s+)?(?:\[[\w-]+\]\s+)?/, ''));

/**
 * The message of a stack whose last line before the frames is `h`. A message printed over several
 * lines (assert, node --test) starts at the error's own line; a tool that prints details between
 * the message and the frames (Vite: `Plugin:`, `File:`) has its message further up.
 */
function messageOf(lines: readonly string[], h: number): string {
  const own = header(lines[h]!);
  if (ERROR_HEAD.test(lines[h]!)) return own;
  for (let k = h - 1; k >= 0 && k >= h - 6; k--)
    if (ERROR_HEAD.test(lines[k]!)) {
      const head = header(lines[k]!);
      return head.endsWith(':') ? `${head} ${own}` : head;
    }
  if (!DETAIL.test(lines[h]!)) return own;
  for (let k = h - 1; k >= 0 && k >= h - 20; k--)
    if (SOME_ERROR.test(lines[k]!) && !DETAIL.test(lines[k]!)) return cleanHead(lines[k]!);
  return own;
}

/** Consecutive lines matching `frame`, from `i`. */
function run(lines: readonly string[], i: number, frame: (line: string) => boolean): number {
  let end = i;
  while (end < lines.length && frame(lines[end]!)) end++;
  return end;
}

function stacks(lines: readonly string[]): Found[] {
  const out: Found[] = [];
  for (let i = 0; i < lines.length; i++) {
    const v8 = V8_FRAME.test(lines[i]!) && LOCATION.test(lines[i]!.replace(/\)$/, ''));
    const firefox = !v8 && (FIREFOX_AT.test(lines[i]!) || FIREFOX_COPY.test(lines[i]!));
    if (!v8 && !firefox) continue;
    const h = lineBefore(lines, i);
    const end = run(lines, i, (l) =>
      v8 ? V8_FRAME.test(l) : FIREFOX_AT.test(l) || FIREFOX_COPY.test(l),
    );
    // A frame line without a message before it is not a stack we can name (or a Rust backtrace,
    // whose parser claims it first).
    if (h === undefined || V8_FRAME.test(lines[h]!)) {
      i = end - 1;
      continue;
    }
    const frames: RawFrame[] = [];
    for (let j = i; j < end; j++) {
      const line = lines[j]!;
      let frame: RawFrame | undefined;
      if (v8) {
        const m = V8_FRAME.exec(line)!;
        frame = m[2] !== undefined ? frameAt(m[1], m[2]) : frameAt(undefined, m[3]!);
      } else {
        const m = FIREFOX_AT.exec(line) ?? FIREFOX_COPY.exec(line)!;
        frame = frameAt(m[1] || undefined, `${m[2]}:${m[3]}${m[4] ? `:${m[4]}` : ''}`);
      }
      if (frame) frames.push(frame);
    }
    const browser = frames.some((f) => isUrl(f.path)) || firefox;
    out.push({
      start: h,
      end,
      error: { language: browser ? 'browser' : 'node', message: messageOf(lines, h), frames },
    });
    i = end - 1;
  }
  return out;
}

function diagnostics(lines: readonly string[]): Found[] {
  const out: Found[] = [];
  lines.forEach((line, i) => {
    const tsc = TSC.exec(line) ?? TSC_PRETTY.exec(line);
    if (tsc) {
      out.push({
        start: i,
        end: i + 1,
        error: {
          language: 'node',
          message: `${tsc[4]}: ${tsc[5]!.trim()}`,
          frames: [{ path: tsc[1]!.trim(), line: toInt(tsc[2]), column: toInt(tsc[3]) }],
        },
      });
      return;
    }
    const oxc = OXC_HEAD.exec(line);
    const at = oxc && [1, 2].map((k) => OXC_AT.exec(lines[i + k] ?? '')).find(Boolean);
    if (oxc && at) {
      out.push({
        start: i,
        end: i + 1,
        error: {
          language: 'node',
          message: `${oxc[1]}: ${oxc[2]!.trim()}`,
          frames: [{ path: at[1]!, line: toInt(at[2]), column: toInt(at[3]) }],
        },
      });
      return;
    }
    const esbuild = ESBUILD.exec(line);
    if (esbuild)
      out.push({
        start: i,
        end: i + 1,
        error: {
          language: 'node',
          message: esbuild[4]!.trim(),
          frames: [{ path: esbuild[1]!, line: toInt(esbuild[2]), column: toInt(esbuild[3]) }],
        },
      });
  });
  return out;
}

export const javascriptParser: StackParser = {
  language: 'node',
  find: (lines) => [...stacks(lines), ...diagnostics(lines)],
};
