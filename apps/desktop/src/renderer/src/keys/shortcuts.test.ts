import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from './registry';
import {
  comboOf,
  contextOf,
  findShortcut,
  isPlainCombo,
  type ElementLike,
  type FocusContext,
  type KeyLike,
  type Shortcut,
} from './shortcuts';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

/** Fake element: `scopes` are the data-focus-scope values of its ancestors. */
function el(opts: { tag?: string; scopes?: string[]; dialog?: boolean; editable?: boolean }) {
  const scopes = opts.scopes ?? [];
  const node: ElementLike = {
    tagName: opts.tag ?? 'DIV',
    isContentEditable: opts.editable ?? false,
    closest(selector: string) {
      const scoped = /data-focus-scope="(\w+)"/.exec(selector)?.[1];
      if (scoped && scopes.includes(scoped)) return node;
      if (selector.includes('role="dialog"') && opts.dialog) return node;
      return null;
    },
  };
  return node;
}

const ctx = (patch: Partial<FocusContext> = {}): FocusContext => ({
  terminal: false,
  field: false,
  live: false,
  dialog: false,
  ...patch,
});

describe('comboOf', () => {
  it('normalizes modifiers and letters', () => {
    expect(comboOf(key('k', { ctrlKey: true }))).toBe('Ctrl+K');
    expect(comboOf(key('p', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+P');
    expect(comboOf(key('b', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+B');
    expect(comboOf(key('1', { ctrlKey: true }))).toBe('Ctrl+1');
  });

  it('treats Meta as Ctrl and drops Shift on punctuation', () => {
    expect(comboOf(key('k', { metaKey: true }))).toBe('Ctrl+K');
    expect(comboOf(key('?', { shiftKey: true }))).toBe('?');
  });

  it('names special keys and ignores bare modifiers', () => {
    expect(comboOf(key('Enter', { ctrlKey: true }))).toBe('Ctrl+Enter');
    expect(comboOf(key('Escape'))).toBe('Escape');
    expect(comboOf(key(' '))).toBe('Space');
    expect(comboOf(key('Control', { ctrlKey: true }))).toBe('');
  });
});

describe('contextOf', () => {
  it('detects text fields, terminal and live scopes', () => {
    expect(contextOf(el({ tag: 'INPUT' })).field).toBe(true);
    expect(contextOf(el({ editable: true })).field).toBe(true);
    expect(contextOf(el({ scopes: ['live'] })).live).toBe(true);
    expect(contextOf(el({ dialog: true })).dialog).toBe(true);
    expect(contextOf(null)).toEqual(ctx());
  });

  it('the terminal textarea is the terminal, not a field', () => {
    const c = contextOf(el({ tag: 'TEXTAREA', scopes: ['terminal'] }));
    expect(c.terminal).toBe(true);
    expect(c.field).toBe(false);
  });
});

describe('isPlainCombo', () => {
  it('is plain only without Ctrl or Alt', () => {
    expect(isPlainCombo('?')).toBe(true);
    expect(isPlainCombo('Ctrl+K')).toBe(false);
    expect(isPlainCombo('Ctrl+Alt+B')).toBe(false);
    expect(isPlainCombo('Shift+F')).toBe(true);
  });
});

describe('findShortcut with the app registry', () => {
  it('Ctrl+K opens the palette, also from a text field', () => {
    expect(findShortcut(SHORTCUTS, 'Ctrl+K', ctx())?.id).toBe('palette.open');
    expect(findShortcut(SHORTCUTS, 'Ctrl+K', ctx({ field: true }))?.id).toBe('palette.open');
  });

  it('in the terminal only the always-global shortcuts fire', () => {
    const t = ctx({ terminal: true });
    expect(findShortcut(SHORTCUTS, 'Ctrl+K', t)).toBeUndefined();
    expect(findShortcut(SHORTCUTS, 'Ctrl+Shift+P', t)?.id).toBe('palette.open.always');
    expect(findShortcut(SHORTCUTS, 'Ctrl+J', t)?.id).toBe('dock.bottom.toggle');
    expect(findShortcut(SHORTCUTS, 'Ctrl+3', t)?.id).toBe('section.local');
    expect(findShortcut(SHORTCUTS, 'Ctrl+B', t)).toBeUndefined();
  });

  it('a plain key never fires inside a text field', () => {
    expect(findShortcut(SHORTCUTS, '?', ctx())?.id).toBe('help.open');
    expect(findShortcut(SHORTCUTS, '?', ctx({ field: true }))).toBeUndefined();
  });

  it('the palette keys stay active inside a dialog, the rest are suspended', () => {
    const d = ctx({ dialog: true });
    expect(findShortcut(SHORTCUTS, 'Ctrl+K', d)?.id).toBe('palette.open');
    expect(findShortcut(SHORTCUTS, 'Ctrl+B', d)).toBeUndefined();
  });

  it('Ctrl+1…7 map to the seven sections in order', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7].map((n) => findShortcut(SHORTCUTS, `Ctrl+${n}`, ctx())?.id);
    expect(ids).toEqual([
      'section.live',
      'section.infra',
      'section.local',
      'section.mcp',
      'section.git',
      'section.tele',
      'section.settings',
    ]);
  });
});

describe('scopes live and dialog', () => {
  const live: Shortcut = { id: 'map.fit', combo: 'F', label: 'Fit', group: 'Live', scope: 'live' };
  const dlg: Shortcut = {
    id: 'perm.approve',
    combo: 'Ctrl+Enter',
    label: 'Approve',
    group: 'Permission',
    scope: 'dialog',
  };

  it('a live shortcut needs the Live view and no text field', () => {
    expect(findShortcut([live], 'F', ctx())).toBeUndefined();
    expect(findShortcut([live], 'F', ctx({ live: true }))?.id).toBe('map.fit');
    expect(findShortcut([live], 'F', ctx({ live: true, field: true }))).toBeUndefined();
  });

  it('a dialog shortcut fires only inside the dialog', () => {
    expect(findShortcut([dlg], 'Ctrl+Enter', ctx())).toBeUndefined();
    expect(findShortcut([dlg], 'Ctrl+Enter', ctx({ dialog: true }))?.id).toBe('perm.approve');
  });
});

describe('registry', () => {
  it('has unique ids and unique combos', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(new Set(SHORTCUTS.map((s) => s.combo)).size).toBe(SHORTCUTS.length);
  });
});
