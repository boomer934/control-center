// The only file of the main process that touches ipcMain (enforced by ESLint): it registers the
// handlers of @control-center/ipc-contract behind the sender check, and pushes the contract
// events to the trusted windows only (ADR 0007).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { e2eMachineSnapshot, e2eOllamaPort } from '#e2e-faults';
import { dirname, join, win32 } from 'node:path';
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
import { autoUpdater } from 'electron-updater';
import { contract, type Handlers } from '@control-center/ipc-contract';
import {
  createEventEmitter,
  registerIpcHandlers,
  type Emit,
  type EventReceiver,
} from '@control-center/ipc-contract/main';
import { createCapabilityService } from './capabilities/service';
import { resolveClaude, resolveHookNode } from './claude/cli';
import { createClaudeDiscovery } from './claude/discovery';
import { createClaudeService } from './claude/service';
import { resolveCodex } from './codex/cli';
import { createCodexDiscovery } from './codex/discovery';
import { createCodexService } from './codex/service';
import type { ErrorsService } from './errors/service';
import { openExternalSafely } from './hardening';
import { fail as failGit } from './git/repository';
import { createGitService } from './git/service';
import { createErrorExplainer } from './infra/explain-error';
import { createMachineSnapshotReader } from './infra/snapshot';
import { coalesce, makeFailureRouter } from './ipc-events';
import { createProjectService } from './project/service';
import { isAppUrl } from './security/urls';
import { createTerminalService } from './terminal/service';
import { resolveShell } from './terminal/shells';
import { createUpdateService } from './updates/service';
import { openInEditor } from './workspace/editor';
import { resolveWorkspaceFile } from './workspace/paths';
import { createWorkspaceService } from './workspace/service';
import { readSourceLocation } from './workspace/source';

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
  updates: ReturnType<typeof createUpdateService>,
  workspace: Handlers['workspace'],
  terminal: Handlers['terminal'],
  claude: Handlers['claude'],
  codex: Handlers['codex'],
  capabilities: Handlers['capabilities'],
  git: Handlers['git'],
  project: Handlers['project'],
  infra: Handlers['infra'],
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
      getUpdateStatus: updates.getStatus,
      setUpdateEnabled: ({ enabled }) => updates.setEnabled(enabled),
      restartToUpdate: updates.restart,
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
    codex,
    capabilities,
    git,
    project,
    infra,
  };
}

/** In a packaged app, the copy that electron-builder extracts next to app.asar (asarUnpack). */
const unpacked = (path: string) => path.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');

/** The Tree-sitter runtime and grammars ship as files of a runtime dependency (ADR 0012). */
function treeSitterDir(): string {
  return unpacked(dirname(createRequire(__filename).resolve('@vscode/tree-sitter-wasm')));
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

/** At most one `capabilities:changed` every this many ms: a read and its save are one reload. */
const CAPABILITIES_CHANGED_DELAY_MS = 100;
/** At most one `errors:changed` every this many ms: an error storm is one reload, not hundreds. */
const ERRORS_CHANGED_DELAY_MS = 50;

export function registerIpc(
  devServer: URL | null,
  errors: ErrorsService,
  projectRoot: string,
): () => Promise<void> {
  const reportFailure = makeFailureRouter(errors);
  const updates = createUpdateService({
    updater:
      app.isPackaged &&
      process.platform === 'win32' &&
      existsSync(join(process.resourcesPath, 'app-update.yml'))
        ? autoUpdater
        : undefined,
    dataDir: app.getPath('userData'),
    changed: (status) => emit(contract.app.updateStatus, status),
    failed: () => errors.logger.warn('updater', 'update-operation-failed'),
  });
  const terminals = createTerminalService();
  const gitService = createGitService();
  const machineSnapshot = createMachineSnapshotReader();
  const explainError = createErrorExplainer(e2eOllamaPort());
  const projects = createProjectService({
    workerPath: unpacked(join(__dirname, 'project-worker.js')),
    wasmDir: treeSitterDir(),
    report: errors.report,
  });
  let hooksWarned = false;
  const capabilityChanged = coalesce(
    CAPABILITIES_CHANGED_DELAY_MS,
    () =>
      void capabilityService
        .list()
        .then(({ revision }) => emit(contract.capabilities.changed, { revision })),
  );
  const capabilityService = createCapabilityService({
    file: join(app.getPath('userData'), 'capabilities.json'),
    report: errors.report,
    onChanged: () => capabilityChanged.trigger(),
  });
  const claudeDiscovery = createClaudeDiscovery({
    dataDir: app.getPath('userData'),
    report: errors.report,
    program: async () => resolveClaude(),
    capabilities: capabilityService,
  });
  const codexDiscovery = createCodexDiscovery({
    dataDir: app.getPath('userData'),
    report: errors.report,
    program: () => resolveCodex(),
    capabilities: capabilityService,
    clientVersion: app.getVersion(),
  });
  const claudeSessions = createClaudeService({
    dataDir: app.getPath('userData'),
    report: errors.report,
    models: () => claudeDiscovery.models(),
    onCapabilities: (read) => void capabilityService.record('claude', { ...read, additive: true }),
    prepareTurn: async (root, workspaceId, active, create) => {
      const current = await getWorkspaces()
        .then((workspaces) => workspaces.activeRootFor(workspaceId))
        .catch(() => failGit('workspace-unavailable'));
      if (root !== current) failGit('workspace-unavailable');
      return gitService.checkpoint(root, workspaceId, active, create);
    },
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
  const codexSessions = createCodexService({
    dataDir: app.getPath('userData'),
    report: errors.report,
    clientVersion: app.getVersion(),
    program: () => {
      // like Claude's catalog, the first session (or the first look at the list) reads Codex
      void codexDiscovery.refresh();
      return resolveCodex();
    },
    onCapabilitiesChanged: () => codexDiscovery.invalidate(),
    prepareTurn: async (root, workspaceId, active, create) => {
      const current = await getWorkspaces()
        .then((workspaces) => workspaces.activeRootFor(workspaceId))
        .catch(() => failGit('workspace-unavailable'));
      if (root !== current) failGit('workspace-unavailable');
      return gitService.checkpoint(root, workspaceId, active, create);
    },
  });
  /** A turn of either provider, or a checkpoint being taken, keeps the workspace busy. */
  const agentsBusy = (workspaceId: string) =>
    claudeSessions.isWorkspaceBusy(workspaceId) || codexSessions.isWorkspaceBusy(workspaceId);
  const owners = new Map<number, { emit: Emit; controller: AbortController; close(): void }>();
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
      controller: new AbortController(),
      emit: createEventEmitter({
        targets: () => trustedReceivers(devServer, id),
        onFailure: reportFailure,
      }),
      close() {
        owner.controller.abort();
        owners.delete(id);
        terminals.closeOwner(id);
        gitService.clearOwner(id);
        projects.closeOwner(id);
        void claudeSessions.closeOwner(id).catch(() => {
          errors.logger.error('main', 'claude-window-close-failed');
        });
        void codexSessions.closeOwner(id).catch(() => {
          errors.logger.error('main', 'codex-window-close-failed');
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
    readSourceLocation: async ({ workspaceId, path, line }, { senderId }) => {
      if (senderId === undefined) return null;
      const owner = windowOwner(senderId);
      if (!owner) return null;
      const workspaces = await getWorkspaces();
      const root = await workspaces.activeRootFor(workspaceId);
      if (!root || owner.controller.signal.aborted) return null;
      const source = await readSourceLocation(root, path, line);
      return !owner.controller.signal.aborted && workspaces.isActive(workspaceId) ? source : null;
    },
  };

  let activeExplanation:
    | { senderId: number; requestId: string; controller: AbortController; signal: AbortSignal }
    | undefined;
  const infra: Handlers['infra'] = {
    snapshot: () => e2eMachineSnapshot() ?? machineSnapshot(),
    explainProjectError: async ({ requestId, workspaceId, error }, { senderId }) => {
      if (senderId === undefined) return 'unavailable';
      const owner = windowOwner(senderId);
      if (!owner) return 'unavailable';
      if (activeExplanation && !activeExplanation.signal.aborted) return 'busy';
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, owner.controller.signal]);
      const request = { senderId, requestId, controller, signal };
      // Register before awaiting workspace validation so an immediate cancellation is honored.
      activeExplanation = request;
      try {
        const workspaces = await getWorkspaces();
        const root = await workspaces.activeRootFor(workspaceId);
        if (signal.aborted) return 'cancelled';
        if (!root) return 'unavailable';
        return await explainError(error, signal, () => workspaces.isActive(workspaceId));
      } finally {
        if (activeExplanation === request) activeExplanation = undefined;
      }
    },
    cancelProjectErrorExplanation: ({ requestId }, { senderId }) => {
      const request = activeExplanation;
      if (!request || request.senderId !== senderId || request.requestId !== requestId)
        return false;
      request.controller.abort();
      return true;
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
      return terminals.start(
        senderId,
        request,
        cwd,
        shell,
        (update) => owner.emit(contract.terminal.updated, update),
        (found, at) => {
          claudeSessions.reportErrors(senderId, request.workspaceId, found, at);
          codexSessions.reportErrors(senderId, request.workspaceId, found, at);
        },
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
      claudeSessions.send(
        senderId,
        id,
        text,
        (await getWorkspaces()).isActive,
        codexSessions.isWorkspaceBusy,
      ),
    respond: async (request, { senderId }) =>
      claudeSessions.respond(senderId, request, (await getWorkspaces()).isActive),
    configure: (request, { senderId }) => claudeSessions.configure(senderId, request),
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

  const codex: Handlers['codex'] = {
    start: async (request, { senderId }) => {
      if (senderId === undefined) return 'workspace-unavailable';
      const owner = windowOwner(senderId);
      if (!owner) return 'workspace-unavailable';
      const cwd = await (await getWorkspaces()).activeRootFor(request.workspaceId);
      if (!cwd || owners.get(senderId) !== owner) return 'workspace-unavailable';
      return codexSessions.start(senderId, request, cwd, (update) =>
        owner.emit(contract.codex.updated, update),
      );
    },
    send: async ({ id, text }, { senderId }) =>
      codexSessions.send(
        senderId,
        id,
        text,
        (await getWorkspaces()).isActive,
        claudeSessions.isWorkspaceBusy,
      ),
    respond: async (request, { senderId }) =>
      codexSessions.respond(senderId, request, (await getWorkspaces()).isActive),
    configure: (request, { senderId }) => codexSessions.configure(senderId, request),
    listHistory: async ({ workspaceId }, { senderId }) => {
      const workspaces = await getWorkspaces();
      if (senderId === undefined || !windowOwner(senderId) || !workspaces.isActive(workspaceId))
        return [];
      return codexSessions.listHistory(workspaceId);
    },
    readHistory: async ({ workspaceId, historyId }, { senderId }) => {
      const workspaces = await getWorkspaces();
      if (senderId === undefined || !windowOwner(senderId) || !workspaces.isActive(workspaceId))
        return null;
      return codexSessions.readHistory(workspaceId, historyId);
    },
    interrupt: ({ id }, { senderId }) => codexSessions.interrupt(senderId, id),
    close: ({ id }, { senderId }) => codexSessions.close(senderId, id),
  };

  async function gitContext(workspaceId: string, senderId?: number) {
    if (senderId === undefined) return null;
    const owner = windowOwner(senderId);
    if (!owner) return null;
    const workspaces = await getWorkspaces();
    const root = await workspaces.activeRootFor(workspaceId);
    const active = () => owners.get(senderId) === owner && workspaces.isActive(workspaceId);
    return root && active()
      ? {
          root,
          workspaceId,
          owner: senderId,
          active,
          busy: () => agentsBusy(workspaceId),
        }
      : null;
  }

  const unavailable = { ok: false, error: 'workspace-unavailable' } as const;
  const git: Handlers['git'] = {
    status: async ({ workspaceId }, { senderId }) => {
      const ctx = await gitContext(workspaceId, senderId);
      return ctx ? gitService.status(ctx) : unavailable;
    },
    diff: async ({ workspaceId, target }, { senderId }) => {
      const ctx = await gitContext(workspaceId, senderId);
      return ctx ? gitService.diff(ctx, target) : unavailable;
    },
    stage: async ({ workspaceId, path, staged }, { senderId }) => {
      const ctx = await gitContext(workspaceId, senderId);
      return ctx ? gitService.stage(ctx, path, staged) : unavailable;
    },
    commit: async ({ workspaceId, message }, { senderId }) => {
      const ctx = await gitContext(workspaceId, senderId);
      return ctx ? gitService.commit(ctx, message) : unavailable;
    },
    preview: async ({ workspaceId, id, path }, { senderId }) => {
      const ctx = await gitContext(workspaceId, senderId);
      return ctx ? gitService.preview(ctx, id, path) : unavailable;
    },
    restore: async ({ workspaceId, token }, { senderId }) => {
      const ctx = await gitContext(workspaceId, senderId);
      return ctx ? gitService.restore(ctx, token) : unavailable;
    },
  };

  const project: Handlers['project'] = {
    open: async ({ workspaceId }, { senderId }) => {
      if (senderId === undefined) return unavailable;
      const owner = windowOwner(senderId);
      if (!owner) return unavailable;
      const workspaces = await getWorkspaces();
      const root = await workspaces.activeRootFor(workspaceId);
      if (!root || owners.get(senderId) !== owner) return unavailable;
      return projects.open(
        senderId,
        workspaceId,
        root,
        (update) => owner.emit(contract.project.updated, update),
        () => owners.get(senderId) === owner && workspaces.isActive(workspaceId),
      );
    },
  };

  const capabilities: Handlers['capabilities'] = {
    list: () => {
      // the list answers at once; a read of the CLI, when due, arrives as `capabilities:changed`
      void claudeDiscovery.refresh();
      void codexDiscovery.refresh();
      return capabilityService.list();
    },
    markSeen: ({ agent, revision }) => capabilityService.markSeen(agent, revision),
  };

  const disposeHandlers = registerIpcHandlers(
    ipcMain,
    makeHandlers(
      errors,
      updates,
      workspace,
      terminal,
      claude,
      codex,
      capabilities,
      git,
      project,
      infra,
    ),
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
  updates.start();

  return () => {
    updates.dispose();
    claudeSessions.terminateAll();
    codexSessions.terminateAll();
    projects.dispose();
    for (const owner of owners.values()) owner.close();
    stopErrors();
    errorsChanged.cancel();
    capabilityChanged.cancel();
    disposeHandlers();
    return Promise.all([
      claudeSessions.closeAll(),
      codexSessions.closeAll(),
      claudeDiscovery.close(),
      codexDiscovery.close(),
    ]).then(() => undefined);
  };
}
