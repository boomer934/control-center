// In-memory groups of the errors seen since the app started (or since the last "clear"). The
// Console reads them; the logger keeps the full history on disk. Bounded, so an error loop
// cannot grow the memory of the main process.
import { createHash } from 'node:crypto';
import { parseStack } from './stack';
import type { ErrorGroup, ErrorInput, StackFrame } from './types';

export interface ErrorStoreOptions {
  /** Root of the project, to make frame paths relative. */
  projectRoot: string;
  /** Redaction of free text: secrets out, home and project paths masked. */
  clean: (text: string) => string;
  maxGroups?: number;
}

const MAX_MESSAGE = 2000;
const MAX_NAME = 200;

/** Same error, different numbers or ids → same group. */
function normalizeForId(message: string): string {
  return message
    .replace(/0x[0-9a-f]+/gi, '#')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '#')
    .replace(/\d+/g, '#')
    .slice(0, 300);
}

function topProjectFrame(frames: readonly StackFrame[]): string {
  const f = frames.find((x) => x.kind === 'project') ?? frames[0];
  return f ? `${f.file}:${f.line ?? ''}` : '';
}

export class ErrorStore {
  private readonly groups = new Map<string, ErrorGroup>();
  private readonly maxGroups: number;
  private rev = 0;
  private readonly changeListeners = new Set<{ fn: (revision: number) => void }>();

  constructor(private readonly options: ErrorStoreOptions) {
    this.maxGroups = options.maxGroups ?? 200;
  }

  /** Increases at every change: lets a reader skip work when nothing happened. */
  get revision(): number {
    return this.rev;
  }

  /**
   * Called after every change with the new revision. A listener that throws is ignored: the
   * store is fed by the error capture itself, so it must never fail because of a reader.
   */
  onChange(listener: (revision: number) => void): () => void {
    const entry = { fn: listener };
    this.changeListeners.add(entry);
    return () => {
      this.changeListeners.delete(entry);
    };
  }

  private changed(): void {
    this.rev += 1;
    for (const entry of [...this.changeListeners]) {
      try {
        entry.fn(this.rev);
      } catch {
        // see onChange
      }
    }
  }

  record(input: ErrorInput): ErrorGroup {
    const { clean, projectRoot } = this.options;
    const frames = (input.stack ? parseStack(input.stack, projectRoot) : []).map<StackFrame>(
      (f) => ({ ...f, fn: f.fn === null ? null : clean(f.fn), file: clean(f.file) }),
    );
    const name = clean(input.name).slice(0, MAX_NAME);
    const message = clean(input.message).slice(0, MAX_MESSAGE);
    const id = createHash('sha1')
      .update(
        [
          input.origin,
          input.source,
          input.kind,
          name,
          normalizeForId(message),
          topProjectFrame(frames),
        ].join('\n'),
      )
      .digest('hex')
      .slice(0, 12);

    const at = (input.at ?? new Date()).toISOString();
    const previous = this.groups.get(id);
    const group: ErrorGroup = previous
      ? { ...previous, count: previous.count + 1, lastSeen: at }
      : {
          id,
          origin: input.origin,
          source: clean(input.source).slice(0, MAX_NAME),
          kind: input.kind,
          name,
          message,
          frames,
          count: 1,
          firstSeen: at,
          lastSeen: at,
        };
    // re-insert: Map order = least recently seen first
    this.groups.delete(id);
    this.groups.set(id, group);
    while (this.groups.size > this.maxGroups) {
      const oldest = this.groups.keys().next().value;
      if (oldest === undefined) break;
      this.groups.delete(oldest);
    }
    this.changed();
    return group;
  }

  /** Most recent first. */
  list(): ErrorGroup[] {
    return [...this.groups.values()].reverse();
  }

  clear(): number {
    const n = this.groups.size;
    this.groups.clear();
    this.changed();
    return n;
  }
}
