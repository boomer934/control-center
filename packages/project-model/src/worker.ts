// Worker thread entry: owns one ProjectIndexer and its watcher, so scanning and parsing never
// block the main process. Bundled by electron-vite as out/main/project-worker.js; Node can also
// run it from source (type stripping), which the integration test does.
import { parentPort } from 'node:worker_threads';
import { ProjectIndexer } from './indexer.ts';
import { DELTA_INTERVAL_MS, WorkerStartSchema, type WorkerMessage } from './protocol.ts';
import { watchTree, type WatchBatch } from './watch.ts';

const port = parentPort;
if (!port) throw new Error('The project model worker must run in a worker thread');

const post = (message: WorkerMessage) => port.postMessage(message);

let started = false;

port.on('message', (raw: unknown) => {
  const parsed = WorkerStartSchema.safeParse(raw);
  if (!parsed.success || started) return;
  started = true;
  const { root, wasmDir } = parsed.data;

  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const delta = indexer.flush();
    if (delta) post({ type: 'delta', delta });
  };
  const indexer: ProjectIndexer = new ProjectIndexer({
    root,
    wasmDir,
    onChange: () => {
      if (ready && !timer) timer = setTimeout(flush, DELTA_INTERVAL_MS);
    },
    onError: () => undefined,
  });

  // Watch before scanning, so changes made during the scan are not lost.
  const early: WatchBatch[] = [];
  watchTree(root, (batch) => {
    if (ready) void indexer.refresh(batch);
    else early.push(batch);
  });

  indexer.start().then(
    (snapshot) => {
      post({ type: 'snapshot', snapshot });
      ready = true;
      for (const batch of early) void indexer.refresh(batch);
      if (!timer) timer = setTimeout(flush, DELTA_INTERVAL_MS);
    },
    () => {
      post({ type: 'failed' });
    },
  );
});
