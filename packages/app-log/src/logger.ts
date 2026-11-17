// Structured logger: one JSON object per line (JSONL) in rotated files. Everything that reaches a
// file passes through `clean` (secrets redacted, home and project paths masked) and values under
// keys that look like credentials are replaced outright. Logging never throws: a full disk must
// not take the app down.
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel } from './types';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY =
  /(?:api[_-]?key|access[_-]?key|secret|token|passw(?:or)?d|pwd|authorization|cookie)/i;
const MAX_DEPTH = 6;
const MAX_STRING = 8000;
const MAX_ITEMS = 100;

export interface LoggerOptions {
  /** Directory of the log files (created when missing). */
  dir: string;
  /** Files are `<baseName>.jsonl`, `<baseName>.1.jsonl`, … */
  baseName?: string;
  /** Rotate when the active file would grow past this. Default 1 MiB. */
  maxBytes?: number;
  /** Active file plus rotated ones kept. Default 5. */
  maxFiles?: number;
  minLevel?: LogLevel;
  clean: (text: string) => string;
  now?: () => Date;
}

export interface Logger {
  log(level: LogLevel, source: string, event: string, data?: Record<string, unknown>): void;
  debug(source: string, event: string, data?: Record<string, unknown>): void;
  info(source: string, event: string, data?: Record<string, unknown>): void;
  warn(source: string, event: string, data?: Record<string, unknown>): void;
  error(source: string, event: string, data?: Record<string, unknown>): void;
  /** Absolute path of the active file. */
  readonly file: string;
}

/** Deep copy with every string cleaned and credential-looking keys blanked. */
export function sanitizeValue(
  value: unknown,
  clean: (text: string) => string,
  depth = 0,
  key = '',
): unknown {
  if (typeof value === 'string') {
    if (SECRET_KEY.test(key)) return '<redacted:field>';
    return clean(value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === undefined) return undefined;
  if (depth >= MAX_DEPTH) return '<max-depth>';
  if (value instanceof Error) {
    return sanitizeValue(
      { name: value.name, message: value.message, stack: value.stack },
      clean,
      depth + 1,
      key,
    );
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((v) => sanitizeValue(v, clean, depth + 1, key));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, MAX_ITEMS)) {
      const cleaned = sanitizeValue(v, clean, depth + 1, k);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return clean(String(value));
}

export function createLogger(options: LoggerOptions): Logger {
  const baseName = options.baseName ?? 'control-center';
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const maxFiles = Math.max(1, options.maxFiles ?? 5);
  const minLevel = options.minLevel ?? 'info';
  const now = options.now ?? (() => new Date());
  const nameOf = (i: number) =>
    join(options.dir, i === 0 ? `${baseName}.jsonl` : `${baseName}.${i}.jsonl`);
  const active = nameOf(0);

  let ready = false;
  let size = 0;

  function prepare(): void {
    if (ready) return;
    mkdirSync(options.dir, { recursive: true });
    try {
      size = statSync(active).size;
    } catch {
      size = 0;
    }
    ready = true;
  }

  function rotate(): void {
    rmSync(nameOf(maxFiles - 1), { force: true });
    for (let i = maxFiles - 2; i >= 0; i--) {
      try {
        renameSync(nameOf(i), nameOf(i + 1));
      } catch {
        // that generation does not exist yet
      }
    }
    size = 0;
  }

  function log(level: LogLevel, source: string, event: string, data?: Record<string, unknown>) {
    if (ORDER[level] < ORDER[minLevel]) return;
    try {
      prepare();
      const entry = {
        ts: now().toISOString(),
        level,
        source: options.clean(source),
        event: options.clean(event),
        ...(data ? { data: sanitizeValue(data, options.clean) } : {}),
      };
      const line = `${JSON.stringify(entry)}\n`;
      const bytes = Buffer.byteLength(line);
      if (size > 0 && size + bytes > maxBytes) rotate();
      appendFileSync(active, line, 'utf8');
      size += bytes;
    } catch {
      // never let logging break the app
    }
  }

  return {
    log,
    debug: (s, e, d) => log('debug', s, e, d),
    info: (s, e, d) => log('info', s, e, d),
    warn: (s, e, d) => log('warn', s, e, d),
    error: (s, e, d) => log('error', s, e, d),
    file: active,
  };
}
