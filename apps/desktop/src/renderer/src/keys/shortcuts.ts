// Shortcut engine: pure functions, no DOM types, unit-tested in node.
// Focus rules come from design/ricerca/architettura.md ("Ambiti di focus"):
//  - a shortcut applies in the innermost scope that has focus;
//  - the terminal captures everything except the shortcuts marked `fromTerminal`;
//  - single keys (no Ctrl/Alt/Meta) never fire inside a text field, and `live` ones only in the Live view.

export type ShortcutScope = 'global' | 'live' | 'dialog';

export interface Shortcut {
  id: string;
  /** Canonical combo, for example `Ctrl+Shift+P`, `Ctrl+1`, `?`. */
  combo: string;
  label: string;
  group: string;
  scope: ShortcutScope;
  /** Still fires when the focus is inside the terminal. */
  fromTerminal?: boolean;
  /** Still fires while a dialog is open (global shortcuts are otherwise suspended). */
  whileDialog?: boolean;
}

export interface FocusContext {
  terminal: boolean;
  field: boolean;
  live: boolean;
  dialog: boolean;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest(selector: string): ElementLike | null;
}

/** Marks a region as a focus scope: `data-focus-scope="terminal" | "live" | "dialog"`. */
export const SCOPE_ATTR = 'data-focus-scope';

const NAMED_KEYS: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  backspace: 'Backspace',
  tab: 'Tab',
  ' ': 'Space',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
};

/** Canonical combo of a keyboard event: modifiers in the order Ctrl+Alt+Shift, then the key. */
export function comboOf(e: KeyLike): string {
  const k = e.key;
  if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return '';
  const named = NAMED_KEYS[k.toLowerCase()];
  const isChar = k.length === 1 && named === undefined;
  const isLetterOrDigit = isChar && /[a-z0-9]/i.test(k);
  const key = named ?? (isLetterOrDigit ? k.toUpperCase() : k);
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Shift is part of the character for punctuation (`?`), so it is not repeated.
  if (e.shiftKey && !(isChar && !isLetterOrDigit)) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function isPlainCombo(combo: string): boolean {
  return !/(^|\+)(Ctrl|Alt)\+/.test(combo);
}

/** Where the focus is, from the element that has it. */
export function contextOf(el: ElementLike | null): FocusContext {
  if (!el) return { terminal: false, field: false, live: false, dialog: false };
  const tag = el.tagName?.toUpperCase();
  const terminal = el.closest(`[${SCOPE_ATTR}="terminal"]`) !== null;
  return {
    terminal,
    field:
      !terminal &&
      (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true),
    live: el.closest(`[${SCOPE_ATTR}="live"]`) !== null,
    dialog: el.closest(`[role="dialog"],[${SCOPE_ATTR}="dialog"]`) !== null,
  };
}

export function isActive(shortcut: Shortcut, ctx: FocusContext): boolean {
  if (ctx.terminal && !shortcut.fromTerminal) return false;
  if (ctx.dialog && shortcut.scope !== 'dialog' && !shortcut.whileDialog) return false;
  if (shortcut.scope === 'dialog' && !ctx.dialog) return false;
  if (shortcut.scope === 'live' && !ctx.live) return false;
  if (isPlainCombo(shortcut.combo) && ctx.field) return false;
  return true;
}

export function findShortcut(
  shortcuts: readonly Shortcut[],
  combo: string,
  ctx: FocusContext,
): Shortcut | undefined {
  return shortcuts.find((s) => s.combo === combo && isActive(s, ctx));
}
