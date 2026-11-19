// Lays the visible map out in the layout worker. Only a structural change (the visible map key,
// the density) asks for a new layout; state changes never do. The previous layout stays on
// screen until the new one arrives, and only the answer to the latest request is used.
import { useEffect, useRef, useState } from 'react';
import {
  assembleLayout,
  metricsFrom,
  packRequest,
  type MapLayout,
  type PackResponse,
} from './layout';
import type { VisibleMap } from './visible';

type WorkerAnswer = PackResponse | { id: number; error: true };

let shared: Worker | undefined;
function layoutWorker(): Worker {
  shared ??= new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  return shared;
}

export function useMapLayout(
  visible: VisibleMap,
  density: string,
  aspect: number,
): { layout?: MapLayout; failed: boolean } {
  const [state, setState] = useState<{ layout?: MapLayout; failed: boolean }>({ failed: false });
  const request = useRef(0);
  const latest = useRef(visible);
  latest.current = visible;

  useEffect(() => {
    const id = ++request.current;
    const metrics = metricsFrom(getComputedStyle(document.documentElement));
    const worker = layoutWorker();
    const onMessage = (event: MessageEvent<WorkerAnswer>) => {
      if (event.data.id !== id || request.current !== id) return;
      worker.removeEventListener('message', onMessage);
      const answer = event.data;
      if ('error' in answer) setState((s) => ({ ...s, failed: true }));
      else setState({ layout: assembleLayout(latest.current, metrics, answer), failed: false });
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage(packRequest(id, visible, metrics, aspect));
    return () => worker.removeEventListener('message', onMessage);
    // The aspect only matters for the next structural change: resizing does not re-pack.
  }, [visible.key, density]);

  return state;
}
