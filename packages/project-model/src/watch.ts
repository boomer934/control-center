// Incremental updates: Node's recursive fs.watch (ReadDirectoryChangesW on Windows, FSEvents on
// macOS, inotify on Linux since Node 20), batched. No chokidar (ADR 0012): the indexer stats every
// reported path itself, so the raw notifications are enough. When the watcher cannot say what
// changed (no file name, too many paths, an error) the caller rescans everything.
import { watch, type FSWatcher } from 'node:fs';

export type WatchBatch = string[] | 'all';

export interface WatchOptions {
  /** Quiet time before a batch is delivered. */
  delayMs?: number;
  /** Beyond this many paths in a batch, ask for a full rescan instead. */
  maxBatch?: number;
  /** Retry delay after the watcher failed. */
  retryMs?: number;
}

/** Watches `root` recursively. Returns a function that stops watching. */
export function watchTree(
  root: string,
  onBatch: (batch: WatchBatch) => void,
  { delayMs = 100, maxBatch = 2000, retryMs = 2000 }: WatchOptions = {},
): () => void {
  let pending = new Set<string>();
  let all = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined;
  let stopped = false;

  const deliver = () => {
    timer = undefined;
    const batch: WatchBatch = all || pending.size > maxBatch ? 'all' : [...pending];
    pending = new Set();
    all = false;
    if (batch === 'all' || batch.length) onBatch(batch);
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(deliver, delayMs);
  };

  const start = (recovering = false) => {
    retry = undefined;
    if (stopped) return;
    try {
      watcher = watch(root, { recursive: true, persistent: false }, (_event, name) => {
        if (typeof name !== 'string' || !name) all = true;
        else pending.add(name.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''));
        schedule();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = undefined;
        all = true;
        schedule();
        retry = setTimeout(() => start(true), retryMs);
      });
      // A rescan performed after reattaching covers changes made while no watcher was active.
      if (recovering) {
        all = true;
        schedule();
      }
    } catch {
      retry = setTimeout(() => start(true), retryMs);
    }
  };
  start();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (retry) clearTimeout(retry);
    watcher?.close();
  };
}
