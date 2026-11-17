import { useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { Icon } from '../ui/icons';
import { Kbd } from '../ui/primitives';
import { useModalInert } from '../ui/useModalInert';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon?: string;
  /** Combo shown on the right, when the command has a shortcut. */
  combo?: string;
  /** Extra words that also match (for example `dark` for the theme commands). */
  keywords?: string[];
  run(): void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: readonly PaletteCommand[];
  onClose(): void;
}

/** Command palette (Ctrl+K, and Ctrl+Shift+P everywhere). Styled by the `.pal` classes. */
export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const returnFocus = useRef<HTMLElement | null>(null);

  useModalInert(open);
  useEffect(() => {
    if (!open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => returnFocus.current?.focus();
  }, [open]);

  if (!open) return null;

  const groups = [...new Set(commands.map((c) => c.group))];

  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div
        className="modal pal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <Command label="Command palette" loop>
          <div className="q">
            <Icon name="search" />
            <span className="pre">&gt;</span>
            <Command.Input autoFocus placeholder="Type a command…" data-testid="palette-input" />
          </div>
          <Command.List className="res">
            <Command.Empty className="empty-row">No commands match.</Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group} heading={group}>
                {commands
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <Command.Item
                      key={c.id}
                      className="it"
                      value={`${c.label} ${(c.keywords ?? []).join(' ')}`}
                      data-testid={`cmd-${c.id}`}
                      onSelect={() => {
                        onClose();
                        c.run();
                      }}
                    >
                      {c.icon && <Icon name={c.icon} />}
                      <span>{c.label}</span>
                      {c.combo && <Kbd>{c.combo}</Kbd>}
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
          </Command.List>
          <div className="ft">
            <span>
              <Kbd>↑↓</Kbd>move
            </span>
            <span>
              <Kbd>Enter</Kbd>run
            </span>
            <span>
              <Kbd>Esc</Kbd>close
            </span>
          </div>
        </Command>
      </div>
    </>
  );
}
