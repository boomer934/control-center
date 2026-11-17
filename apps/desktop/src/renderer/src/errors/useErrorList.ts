import { useEffect, useState } from 'react';
import type { ErrorGroupDto } from '@control-center/ipc-contract';

export interface ErrorListState {
  revision: number;
  groups: ErrorGroupDto[];
}

const EMPTY: ErrorListState = { revision: -1, groups: [] };

/**
 * The groups the main process holds. Loaded once, then again whenever the main process pushes
 * `errors:changed` (ADR 0007). At most one `errors:list` is in flight: changes that arrive
 * meanwhile cause a single reload after it. The revision only grows, so a late answer never
 * replaces a newer one.
 */
export function useErrorList(): ErrorListState & { refresh(): void } {
  const [state, setState] = useState<ErrorListState>(EMPTY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let again = false;
    let known = -1;

    const load = () => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      window.api.errors
        .list()
        .then((next) => {
          if (!alive) return;
          known = Math.max(known, next.revision);
          setState((prev) => (next.revision > prev.revision ? next : prev));
        })
        .catch(() => {
          // the main process does not answer: keep what is shown
        })
        .finally(() => {
          inFlight = false;
          if (alive && again) {
            again = false;
            load();
          }
        });
    };

    const unsubscribe = window.api.errors.onChanged(({ revision }) => {
      if (revision > known) load();
    });
    load();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [tick]);

  return { ...state, refresh: () => setTick((n) => n + 1) };
}
