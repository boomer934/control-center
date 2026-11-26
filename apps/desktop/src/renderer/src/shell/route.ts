import { useCallback, useEffect, useRef, useState } from 'react';
import { SECTIONS, type SectionId } from '../keys/registry';

/**
 * The map lab (phase 5b) drives the map with the recorded fixtures for the visual and performance
 * tests. It exists only in the development and E2E builds: elsewhere the flag is a false constant
 * and the lab, with the fixtures, is left out of the bundle.
 */
export const MAP_LAB: boolean = __CC_E2E_FAULTS__ || import.meta.env.DEV;

/** Views of the app: the seven sections plus the internal pages. */
export type RouteId = SectionId | 'components' | 'map-lab';

const ROUTE_IDS: readonly string[] = [
  ...SECTIONS.map((s) => s.id),
  'components',
  ...(MAP_LAB ? ['map-lab'] : []),
];

export function parseRoute(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').replace(/\?.*$/, '');
  return (ROUTE_IDS.includes(id) ? id : 'live') as RouteId;
}

/** Query parameters of the hash (`#/map-lab?scene=writing`). */
export function routeParam(name: string): string | null {
  const query = window.location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
}

export function hrefOf(route: RouteId): string {
  return `#/${route}`;
}

/** Hash-based routing: no server, and every view is a real link. */
export function useRoute(restored?: RouteId): [RouteId, (route: RouteId) => void] {
  const initial = useRef(restored);
  const [route, setRoute] = useState<RouteId>(
    () => initial.current ?? parseRoute(window.location.hash),
  );

  useEffect(() => {
    if (initial.current) window.history.replaceState(null, '', hrefOf(initial.current));
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: RouteId) => {
    window.location.hash = hrefOf(next);
  }, []);

  return [route, go];
}
