import { useEffect } from 'react';

/**
 * While a modal is open, everything else in the app frame is `inert`: no focus, no clicks, and
 * hidden from screen readers, so Tab cannot leave the dialog. The scrim and the modals themselves
 * stay live. Declare it before the effect that restores focus, so the frame is live again by then.
 */
export function useModalInert(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const frame = document.querySelector('.frame');
    if (!frame) return;
    const inerted: HTMLElement[] = [];
    for (const child of Array.from(frame.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.classList.contains('scrim') || child.classList.contains('modal')) continue;
      if (child.inert) continue;
      child.inert = true;
      inerted.push(child);
    }
    return () => {
      for (const el of inerted) el.inert = false;
    };
  }, [open]);
}
