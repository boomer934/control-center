import { useEffect, useRef } from 'react';
import { SHORTCUTS } from './registry';
import { comboOf, contextOf, findShortcut, type ElementLike } from './shortcuts';

export type ShortcutHandlers = Partial<Record<string, () => void>>;

/** One window-level listener; the handlers may change on every render without re-subscribing. */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const combo = comboOf(e);
      if (!combo) return;
      const target = e.target instanceof Element ? (e.target as unknown as ElementLike) : null;
      const shortcut = findShortcut(SHORTCUTS, combo, contextOf(target));
      const handler = shortcut && ref.current[shortcut.id];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
