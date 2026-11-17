import { useEffect, useRef } from 'react';
import { SHORTCUTS } from '../keys/registry';
import { Button, Kbd } from '../ui/primitives';
import { useModalInert } from '../ui/useModalInert';

/** `?` dialog: every shortcut by group, straight from the registry. */
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useModalInert(open);
  useEffect(() => {
    if (!open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, [open]);

  if (!open) return null;

  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];

  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div
        className="modal help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        data-testid="shortcut-help"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <div className="mh">
          <h2 id="help-title">Keyboard shortcuts</h2>
        </div>
        <div className="mb help-body">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="help-group">{group}</h3>
              <ul className="help-list">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <Kbd>{s.combo}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mf">
          <span className="hint">
            The terminal keeps every key except the ones listed as global.
          </span>
          <Button ref={closeRef} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
