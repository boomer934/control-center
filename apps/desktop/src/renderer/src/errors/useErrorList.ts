import { useEffect, useState } from 'react';
import type { ErrorGroupDto } from '@control-center/ipc-contract';

export interface ErrorListState {
  revision: number;
  groups: ErrorGroupDto[];
}

const EMPTY: ErrorListState = { revision: -1, groups: [] };

/**
 * The groups the main process holds. Polled once a second: the IPC surface has no push channel
 * (every channel is a reviewed request/response), and `revision` makes a quiet poll free.
 */
export function useErrorList(intervalMs = 1000): ErrorListState & { refresh(): void } {
  const [state, setState] = useState<ErrorListState>(EMPTY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      window.api.errors
        .list()
        .then((next) => {
          if (alive) setState((prev) => (prev.revision === next.revision ? prev : next));
        })
        .catch(() => {
          // the main process does not answer: keep what is shown
        });
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs, tick]);

  return { ...state, refresh: () => setTick((n) => n + 1) };
}
