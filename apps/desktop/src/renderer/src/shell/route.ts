import { useCallback, useEffect, useState } from 'react';
import { SECTIONS, type SectionId } from '../keys/registry';

/** Views of the app: the seven sections plus the internal components page. */
export type RouteId = SectionId | 'components';

const ROUTE_IDS: readonly string[] = [...SECTIONS.map((s) => s.id), 'components'];

export function parseRoute(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '');
  return (ROUTE_IDS.includes(id) ? id : 'live') as RouteId;
}

export function hrefOf(route: RouteId): string {
  return `#/${route}`;
}

/** Hash-based routing: no server, and every view is a real link. */
export function useRoute(): [RouteId, (route: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: RouteId) => {
    window.location.hash = hrefOf(next);
  }, []);

  return [route, go];
}
