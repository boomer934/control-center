// The only file of the main process that touches ipcMain (enforced by ESLint): it registers the
// handlers of @control-center/ipc-contract behind the sender check, and pushes the contract
// events to the trusted windows only (ADR 0007).
import { existsSync } from 'node:fs';
import { join, win32 } from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  webContents,
  type IpcMainInvokeEvent,
  type WebContentsDidStartNavigationEventParams,
} from 'electron';
import { contract, type Handlers } from '@control-center/ipc-contract';
import {
  createEventEmitter,
  registerIpcHandlers,
  type Emit,
  type EventReceiver,
} from '@control-center/ipc-contract/main';
import { resolveClaude, resolveHookNode } from './claude/cli';
import { createClaudeService } from './claude/service';
import type { ErrorsService } from './errors/service';
import { openExternalSafely } from './hardening';
import { coalesce, makeFailureRouter } from './ipc-events';
import { isAppUrl } from './security/urls';
import { createTerminalService } from './terminal/service';
import { resolveShell } from './terminal/shells';
import { openInEditor } from './workspace/editor';
import { resolveWorkspaceFile } from './workspace/paths';
import { createWorkspaceService } from './workspace/service';

/** Windows created by the app itself; IPC from any other WebContents is refused. */
const trustedWindowIds = new Set<number>();

export function trustWindow(win: BrowserWindow): void {
  const id = win.id;
  trustedWindowIds.add(id);
  win.on('closed', () => trustedWindowIds.delete(id));
}

/**
 * A sender is trusted only if it is the top-level frame of one of the app's windows and is
 * showing an app URL (app://control-center, or the dev server in development).
 */
export function makeSenderCheck(devServer: URL | null) {
  return (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null) return false;
    if (!isAppUrl(frame.url, devServer)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    return win !== null && trustedWindowIds.has(win.id) && win.webContents === event.sender;
  };
}

function makeHandlers(
  errors: ErrorsService,
  workspace: Handlers['workspace'],
  terminal: Handlers['terminal'],
  claude: Handlers['claude'],
): Handlers {
  return {
    app: {
      getInfo: () => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        packaged: app.isPackaged,
      }),
    },
    errors: {
      list: () => ({ revision: errors.store.revision, groups: errors.store.list() }),
      reportRenderer: (report) => errors.reportRenderer(report),
      copyReport: () => {
        const { text, groups } = errors.buildReport();
        // The text is already redacted. The main process writes it: the renderer has no
        // clipboard permission.
        clipboard.writeText(text);
        return { copied: true, groups };
      },
      clear: () => ({ cleared: errors.store.clear() }),
    },
    shell: {
      openExternal: async ({ url }) => ({ opened: await openExternalSafely(url) }),
    },
    workspace,
    terminal,
    claude,
  };
}

/**
 * The hook script: from source in a development or test build (Node strips the types), a bundled
 * copy next to the app in a packaged one (phase 10; until then packaged sessions run on the
 * stream alone).
 */
function hookScript(projectRoot: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'hooks-bridge', 'bin.mjs')
    : join(projectRoot, 'packages', 'hooks-bridge', 'src', 'bin.ts');
}

/**
 * The receivers of push events: the same windows whose IPC is trusted, still alive and still
 * showing an app URL. `webContents.send` reaches the top-level frame only.
 */
export function trustedReceivers(devServer: URL | null, owner?: number): EventReceiver[] {
  const out: EventReceiver[] = [];
  for (const id of trustedWindowIds) {
    const win = BrowserWindow.fromId(id);
    if (!win || win.isDestroyed()) continue;
    const contents = win.webContents;
    if (owner !== undefined && contents.id !== owner) continue;
    if (contents.isDestroyed() || !isAppUrl(contents.getURL(), devServer)) continue;
    out.push({ send: (channel, payload) => contents.send(channel, payload) });
  }
  return out;
}

/** At most one `errors:changed` every this many ms: an error storm is one reload, not hundreds. */
const ERRORS_CHANGED_DELAY_MS = 50;

export function registerIpc(
  devServer: URL | null,
  errors: ErrorsService,
  projectRoot: string,
): () => Promise<void> {
  const reportFailure = makeFailureRouter(errors);
  const terminals = createTerminalService();
  let hooksWarned = false;
  const claudeSessions = createClaudeService({
    dataDir: app.getPath('userData'),
    report: errors.report,
    programs: async () => {
      const claude = resolveClaude();
      const node = await resolveHookNode();
      const script = hookScript(projectRoot);
      const hooks = node && existsSync(script) ? { node, script } : undefined;
      if (claude && !hooks && !hooksWarned) {
        hooksWarned = true;
        errors.report({
          origin: 'main',
          source: 'hooks-bridge',
          kind: 'claude-setup',
          name: 'HooksUnavailable',
          message: node
            ? 'The hook script is not available in this build: Claude sessions run on the stream alone'
            : 'Node.js 22.18 or later was not found on PATH: Claude sessions run without hook events',
        });
      }
      return { claude, hooks };
    },
  });
  const owners = new Map<number, { emit: Emit; close(): void }>();
  let workspaceService: ReturnType<typeof createWorkspaceService> | undefined;
  let choosingFolder = false;

  const getWorkspaces = () =>
    (workspaceService ??= createWorkspaceService(
      join(app.getPath('userData'), 'workspaces.json'),
    ).catch((error: unknown) => {
      workspaceService = undefined;
      throw error;
    }));

  function windowOwner(id: number) {
    const existing = owners.get(id);
    if (existing) return existing;
    const contents = webContents.fromId(id);
    if (!contents || contents.isDestroyed()) return;
    const owner = {
      emit: createEventEmitter({
        targets: () => trustedReceivers(devServer, id),
        onFailure: reportFailure,
      }),
      close() {
        owners.delete(id);
        terminals.closeOwner(id);
        void claudeSessions.closeOwner(id).catch(() => {
          errors.logger.error('main', 'claude-window-close-failed');
        });
        contents.off('did-start-navigation', onNavigation);
        contents.off('render-process-gone', owner.close);
        contents.off('destroyed', owner.close);
      },
    };
    function onNavigation(event: WebContentsDidStartNavigationEventParams): void {
      if (event.isMainFrame && !event.isSameDocument) owner.close();
    }
    contents.on('did-start-navigation', onNavigation);
    contents.once('render-process-gone', owner.close);
    contents.once('destroyed', owner.close);
    owners.set(id, owner);
    return owner;
  }

  const workspace: Handlers['workspace'] = {
    getState: async () => (await getWorkspaces()).state(),
    chooseFolder: async (_, { senderId }) => {
      const sender = senderId === undefined ? undefined : webContents.fromId(senderId);
      const win = sender && BrowserWindow.fromWebContents(sender);
      if (!win || choosingFolder) return null;
      choosingFolder = true;
      try {
        const selection = await dialog.showOpenDialog(win, {
          title: 'Open workspace',
          properties: ['openDirectory'],
        });
        const directory = selection.filePaths[0];
        if (selection.canceled || !directory) return null;
        const state = await (await getWorkspaces()).openSelectedFolder(directory);
        if (!state) throw new Error('Selected workspace is unavailable');
        return state;
      } finally {
        choosingFolder = false;
      }
    },
    selectRecent: async ({ id }) => (await getWorkspaces()).selectRecent(id),
    openFile: async ({ workspaceId, path, source }) => {
      const workspaces = await getWorkspaces();
      const root = await workspaces.activeRootFor(workspaceId);
      if (!root) return false;
      const candidate = source === 'problems' ? win32.resolve(projectRoot, path) : path;
      const file = await resolveWorkspaceFile(root, candidate);
      return file && workspaces.isActive(workspaceId) ? openInEditor(file) : false;
    },
  };

  const terminal: Handlers['terminal'] = {
    start: async (request, { senderId }) => {
      if (senderId === undefined) return 'workspace-unavailable';
      const owner = windowOwner(senderId);
      if (!owner) return 'workspace-unavailable';
      const [workspaces, shell] = await Promise.all([getWorkspaces(), resolveShell(request.shell)]);
      if (!shell) return 'shell-unavailable';
      const cwd = await workspaces.activeRootFor(request.workspaceId);
      if (!cwd || owners.get(senderId) !== owner) return 'workspace-unavailable';
      return terminals.start(senderId, request, cwd, shell, (update) =>
        owner.emit(contract.terminal.updated, update),
      );
    },
    write: async ({ id, data }, { senderId }) =>
      terminals.write(senderId, id, data, (await getWorkspaces()).isActive),
    resize: ({ id, ...size }, { senderId }) => terminals.resize(senderId, id, size),
    close: ({ id }, { senderId }) => terminals.close(senderId, id),
  };

  const claude: Handlers['claude'] = {
    start: async (request, { senderId }) => {
      if (senderId === undefined) return 'workspace-unavailable';
      const owner = windowOwner(senderId);
      if (!owner) return 'workspace-unavailable';
      const cwd = await (await getWorkspaces()).activeRootFor(request.workspaceId);
      if (!cwd || owners.get(senderId) !== owner) return 'workspace-unavailable';
      return claudeSessions.start(senderId, request, cwd, (update) =>
        owner.emit(contract.claude.updated, update),
      );
    },
    send: async ({ id, text }, { senderId }) =>
      claudeSessions.send(senderId, id, text, (await getWorkspaces()).isActive),
    respond: async (request, { senderId }) =>
      claudeSessions.respond(senderId, request, (await getWorkspaces()).isActive),
    listHistory: async ({ workspaceId }, { senderId }) => {
      const workspaces = await getWorkspaces();
      if (senderId === undefined || !windowOwner(senderId) || !workspaces.isActive(workspaceId))
        return [];
      return claudeSessions.listHistory(workspaceId);
    },
    readHistory: async ({ workspaceId, historyId }, { senderId }) => {
      const workspaces = await getWorkspaces();
      if (senderId === undefined || !windowOwner(senderId) || !workspaces.isActive(workspaceId))
        return null;
      return claudeSessions.readHistory(workspaceId, historyId);
    },
    interrupt: ({ id }, { senderId }) => claudeSessions.interrupt(senderId, id),
    close: ({ id }, { senderId }) => claudeSessions.close(senderId, id),
  };

  const disposeHandlers = registerIpcHandlers(
    ipcMain,
    makeHandlers(errors, workspace, terminal, claude),
    {
      isTrustedSender: makeSenderCheck(devServer),
      onFailure: reportFailure,
    },
  );

  const emit: Emit = createEventEmitter({
    targets: () => trustedReceivers(devServer),
    onFailure: reportFailure,
  });

  const errorsChanged = coalesce(ERRORS_CHANGED_DELAY_MS, () =>
    emit(contract.errors.changed, { revision: errors.store.revision }),
  );
  const stopErrors = errors.store.onChange(errorsChanged.trigger);

  return () => {
    claudeSessions.terminateAll();
    for (const owner of owners.values()) owner.close();
    stopErrors();
    errorsChanged.cancel();
    disposeHandlers();
    return claudeSessions.closeAll();
  };
}
