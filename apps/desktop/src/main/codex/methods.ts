// The closed lists of app-server methods the app calls (phase 5h.2). The app shows what Codex
// offers but never changes it: no write method (`experimentalFeature/enablement/set`,
// `config/value/write`, `plugin/install`, `fs/*`, `command/exec`, `account/*` writes…) is on
// either list, and no IPC channel lets the renderer name a method.

/** The read-only methods of the capability inventory (./inventory.ts). */
export const CODEX_INVENTORY_METHODS = [
  'model/list',
  'experimentalFeature/list',
  'skills/list',
  'hooks/list',
  'plugin/installed',
  'mcpServerStatus/list',
  'modelProvider/capabilities/read',
  'permissionProfile/list',
] as const;

/** A chat session: handshake, the thread and its turns. */
export const CODEX_SESSION_METHODS: ReadonlySet<string> = new Set([
  'initialize',
  'initialized',
  'account/read',
  'model/list',
  'config/read',
  'thread/start',
  'thread/resume',
  'turn/start',
  'turn/interrupt',
]);

/** The probe without a chat: the handshake and the inventory, nothing else. */
export const CODEX_PROBE_METHODS: ReadonlySet<string> = new Set([
  'initialize',
  'initialized',
  ...CODEX_INVENTORY_METHODS,
]);
export type CodexInventoryMethod = (typeof CODEX_INVENTORY_METHODS)[number];
