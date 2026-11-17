import type { Shortcut } from './shortcuts';

/** Sections of the activity bar, in the order of architettura.md (Ctrl+1 … Ctrl+7). */
export const SECTIONS = [
  { id: 'live', label: 'Live', icon: 'live' },
  { id: 'infra', label: 'Infra', icon: 'infra' },
  { id: 'local', label: 'Local agents', icon: 'chip' },
  { id: 'mcp', label: 'MCP & Skills', icon: 'mcp' },
  { id: 'git', label: 'Git', icon: 'git' },
  { id: 'tele', label: 'Telemetry', icon: 'tele' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

const sectionShortcuts: Shortcut[] = SECTIONS.map((s, i) => ({
  id: `section.${s.id}`,
  combo: `Ctrl+${i + 1}`,
  label: `Go to ${s.label}`,
  group: 'Navigation',
  scope: 'global',
  fromTerminal: true,
}));

/** Every shortcut of the app. The handlers are bound where the state lives (see App). */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'palette.open',
    combo: 'Ctrl+K',
    label: 'Command palette',
    group: 'General',
    scope: 'global',
    whileDialog: true,
  },
  {
    id: 'palette.open.always',
    combo: 'Ctrl+Shift+P',
    label: 'Command palette (also in the terminal)',
    group: 'General',
    scope: 'global',
    fromTerminal: true,
    whileDialog: true,
  },
  {
    id: 'help.open',
    combo: '?',
    label: 'Keyboard shortcuts',
    group: 'General',
    scope: 'global',
  },
  ...sectionShortcuts,
  {
    id: 'problems.toggle',
    combo: 'Ctrl+Shift+M',
    label: 'Show or hide Problems',
    group: 'Layout',
    scope: 'global',
  },
  {
    id: 'dock.bottom.toggle',
    combo: 'Ctrl+J',
    label: 'Show or hide the bottom dock',
    group: 'Layout',
    scope: 'global',
    fromTerminal: true,
  },
  {
    id: 'dock.right.toggle',
    combo: 'Ctrl+Alt+B',
    label: 'Show or hide the right dock',
    group: 'Layout',
    scope: 'global',
  },
  {
    id: 'activity.compact',
    combo: 'Ctrl+B',
    label: 'Compact activity bar',
    group: 'Layout',
    scope: 'global',
  },
];

export function shortcutFor(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}
