// The agent sessions of the app's windows, shared by the `claude:*` and `codex:*` IPC methods.
//
// Like the terminals (4.2), every session belongs to the window that opened it (`owner`): only
// that window can drive it, only that window receives its updates, and the session closes with
// the window. A message is sent only while the session's workspace is still the active one. The
// provider only changes how a session runs (`open`), what can be chosen (`catalog`) and where its
// history lives.
import { randomUUID } from 'node:crypto';
import type { ErrorInput } from '@control-center/app-log';
import { makeTextCleaner, type AgentEvent, type ErrorDraft } from '@control-center/event-schema';
import {
  isConfigInCatalog,
  type AgentCatalog,
  type AgentConfig,
  type AgentConfigureResult,
  type GitCheckpoint,
  type GitError,
} from '@control-center/ipc-contract';
import {
  CLAUDE_EVENTS_PER_UPDATE,
  MAX_CLAUDE_MESSAGE_CHARS,
  type ClaudeHistoryRecord,
  type ClaudePermission,
  type ClaudePermissionChoice,
  type ClaudeSendResult,
  type ClaudeUpdate,
} from '@control-center/ipc-contract/claude';
import { GitFailure } from '../git/repository';
import { createClaudeHistory } from '../claude/history';

export type AgentProvider = 'claude' | 'codex';
export type AgentSessionStatus = 'idle' | 'running' | 'closed';
export type AgentStartResult =
  | 'started'
  | 'workspace-unavailable'
  | 'claude-unavailable'
  | 'codex-unavailable'
  | 'history-unavailable'
  | 'limit'
  | 'failed';
type Publish = (update: ClaudeUpdate) => void;

/** What the service needs of a running session, whatever the provider. */
export interface AgentSession {
  readonly status: AgentSessionStatus;
  /** True when hook events reach the session (Claude's bridge); always false for Codex. */
  readonly hooks: boolean;
  /** Starts a turn with `config` (already checked against the catalog). */
  send(text: string, config?: AgentConfig): 'started' | 'busy' | 'closed';
  respond(requestId: string, choice: ClaudePermissionChoice): boolean;
  reportErrors(errors: readonly ErrorDraft[], at: Date): void;
  interrupt(): boolean;
  /** Synchronous end of the running turn, for app quit. */
  terminate(): void;
  close(): Promise<void>;
  /**
   * The catalog the provider reported while the session opened (Codex `model/list`), with
   * `saved` as the current choice when the catalog offers it. Absent: the service's own catalog.
   */
  catalog?(saved: AgentConfig | undefined): AgentCatalog;
  /** The choice of a resumed session's last turns, once the catalog has accepted it. */
  restoreConfig?(config: AgentConfig): void;
}

/** What every provider's `open` receives. */
export interface AgentOpenOptions {
  sessionId: string;
  /** Workspace root, already verified by the workspace service. */
  cwd: string;
  dataDir: string;
  /** The provider's own id of the session to resume. */
  resume?: string;
  /** Model and effort of the resumed session's last turns, when the catalog offers them. */
  resumeConfig?: AgentConfig;
  env?: NodeJS.ProcessEnv;
  report: (input: ErrorInput) => unknown;
  onEvents: (events: AgentEvent[]) => void;
  onStatus: (status: AgentSessionStatus) => void;
  onPermissions: (requests: ClaudePermission[]) => void;
  onPartial: (text: string) => void;
  onSessionId: (id: string) => void;
}

export interface AgentServiceDeps<P> {
  provider: AgentProvider;
  dataDir: string;
  report: (input: ErrorInput) => unknown;
  maxSessions: number;
  /** How to run the provider's CLI, looked up at each start; undefined: not installed. */
  program: () => Promise<P | undefined>;
  open: (options: AgentOpenOptions, program: P) => Promise<AgentSession>;
  /** The catalog known before the session opens, with `saved` as current when it offers it. */
  catalog: (saved: AgentConfig | undefined) => Promise<AgentCatalog>;
  /**
   * Whether a choice is valid in the session's catalog. Default: `isConfigInCatalog`.
   */
  accepts?: (config: AgentConfig, catalog: AgentCatalog) => boolean;
  /** Runs before the first session opens (Claude: folders left by a crash). */
  beforeFirstStart?: Promise<void>;
  env?: NodeJS.ProcessEnv;
  prepareTurn?: (
    root: string,
    workspaceId: string,
    active: () => boolean,
    create: boolean,
  ) => Promise<GitCheckpoint | null>;
}

interface Entry {
  owner: number;
  workspaceId: string;
  root: string;
  preparing?: boolean;
  firstTurnStarted?: boolean;
  historyId: string;
  record?: (record: ClaudeHistoryRecord) => void;
  clean: (text: string) => string;
  publish: Publish;
  /** Model and effort for the next turn, and what could be chosen. */
  catalog: AgentCatalog;
  session?: AgentSession;
  opening?: Promise<AgentSession>;
  closed: boolean;
  closing?: Promise<void>;
}

const NO_CONFIG: AgentConfig = { model: null, effort: null };
const LABEL: Record<AgentProvider, string> = { claude: 'Claude', codex: 'Codex' };

/**
 * The model and effort the user last chose in a saved session, from its `session.configChanged`
 * events: a resumed session keeps them (phase 5f). Undefined when the session never changed them.
 */
export function lastChosenConfig(records: readonly ClaudeHistoryRecord[]): AgentConfig | undefined {
  let found: AgentConfig | undefined;
  for (const record of records)
    if (record.kind === 'events')
      for (const event of record.events)
        if (event.type === 'session.configChanged' && event.by === 'user')
          found = { model: event.model ?? null, effort: event.effort ?? null };
  return found;
}

/** A sessions' registry, shared by every provider's service (the Git panel asks all of them). */
export interface AgentServiceView {
  isWorkspaceBusy(workspaceId: string): boolean;
}

export function createAgentService<P>(deps: AgentServiceDeps<P>) {
  const { provider } = deps;
  const label = LABEL[provider];
  const setupKind = `${provider}-setup` as const;
  const sessions = new Map<string, Entry>();
  const history = createClaudeHistory(deps.dataDir, `${provider}-history`);
  const accepts = deps.accepts ?? ((config, catalog) => isConfigInCatalog(config, catalog.models));
  const ready = deps.beforeFirstStart ?? Promise.resolve();

  const owned = (owner: number | undefined, id: string) => {
    const entry = sessions.get(id);
    return entry && !entry.closed && entry.owner === owner ? entry : undefined;
  };
  const isWorkspaceBusy = (workspaceId: string) =>
    [...sessions.values()].some(
      (entry) =>
        entry.workspaceId === workspaceId &&
        (entry.preparing || entry.session?.status === 'running' || (entry.closed && entry.closing)),
    );

  const release = (id: string, entry: Entry) => {
    if (sessions.get(id) === entry) sessions.delete(id);
  };
  const dispose = (id: string, entry: Entry) => {
    entry.closed = true;
    return (entry.closing ??= (async () => {
      try {
        const session = entry.session ?? (await entry.opening?.catch(() => undefined));
        await session?.close();
      } finally {
        await history.flush(entry.workspaceId, entry.historyId);
        release(id, entry);
      }
    })());
  };

  return {
    async start(
      owner: number,
      request: { id: string; workspaceId: string; historyId?: string },
      cwd: string,
      publish: Publish,
    ): Promise<AgentStartResult> {
      const { id, workspaceId } = request;
      if (sessions.has(id) || sessions.size >= deps.maxSessions) return 'limit';
      const historyId = request.historyId ?? randomUUID();
      if ([...sessions.values()].some((entry) => entry.historyId === historyId))
        return 'history-unavailable';
      const clean = makeTextCleaner(cwd);
      const entry: Entry = {
        owner,
        workspaceId,
        root: cwd,
        historyId,
        clean,
        publish,
        catalog: { models: [], defaults: NO_CONFIG, current: NO_CONFIG },
        closed: false,
      };
      sessions.set(id, entry);
      try {
        await ready;
        const previous = request.historyId ? await history.read(workspaceId, historyId) : null;
        if (request.historyId && !previous?.resume) {
          release(id, entry);
          return 'history-unavailable';
        }
        const program = await deps.program();
        const saved = previous ? lastChosenConfig(previous.records) : undefined;
        entry.catalog = await deps.catalog(saved);
        // A saved choice the catalog no longer offers (or never did: an altered file) is dropped,
        // and neither reaches the command line nor names itself in a later event.
        const resumeConfig = saved && entry.catalog.current === saved ? saved : undefined;
        if (entry.closed) return 'failed';
        if (program === undefined) {
          release(id, entry);
          return `${provider}-unavailable`;
        }
        let hooksOn = false;
        const write = history.writer(workspaceId, historyId, previous !== null, () =>
          deps.report({
            origin: 'main',
            source: provider,
            kind: setupKind,
            name: 'HistoryWriteFailed',
            message: `Could not save ${label} session history`,
          }),
        );
        entry.record = (record) => {
          write(record);
          publish({ ...record, id });
        };
        entry.opening = deps.open(
          {
            sessionId: id,
            cwd,
            dataDir: deps.dataDir,
            resume: previous?.resume,
            resumeConfig,
            env: deps.env,
            report: deps.report,
            onEvents: (events: AgentEvent[]) => {
              for (let i = 0; i < events.length; i += CLAUDE_EVENTS_PER_UPDATE) {
                const batch = events.slice(i, i + CLAUDE_EVENTS_PER_UPDATE);
                // Some upstream event labels and IDs are free text. Clean them before disk I/O.
                const safe = JSON.parse(
                  JSON.stringify(batch, (_key, value: unknown) =>
                    typeof value === 'string' ? clean(value) : value,
                  ),
                ) as AgentEvent[];
                entry.record?.({ kind: 'events', events: safe });
              }
            },
            onStatus: (status) => publish({ kind: 'status', id, status, hooks: hooksOn }),
            onPermissions: (requests) => publish({ kind: 'permissions', id, requests }),
            onPartial: (text) => publish({ kind: 'partial', id, text }),
            onSessionId: (nativeId) => write({ kind: 'resume', id: nativeId }),
          },
          program,
        );
        const session = await entry.opening;
        // The disposer is responsible for closing a session that finishes opening late.
        if (entry.closed) return 'failed';
        entry.opening = undefined;
        hooksOn = session.hooks;
        if (session.catalog) {
          entry.catalog = session.catalog(saved);
          if (saved && entry.catalog.current === saved) session.restoreConfig?.(saved);
        }
        entry.session = session;
        publish({ kind: 'status', id, status: 'idle', hooks: hooksOn });
        publish({ kind: 'config', id, catalog: entry.catalog });
        return 'started';
      } catch (error) {
        release(id, entry);
        deps.report({
          origin: 'main',
          source: provider,
          kind: setupKind,
          name: error instanceof Error ? error.name : 'Error',
          message: `Could not open a ${label} session: ${error instanceof Error ? error.message : String(error)}`,
        });
        return 'failed';
      }
    },

    async send(
      owner: number | undefined,
      id: string,
      text: string,
      isActive: (workspaceId: string) => boolean,
      /** Sessions of other providers that would make the workspace busy too. */
      othersBusy: (workspaceId: string) => boolean = () => false,
    ): Promise<ClaudeSendResult> {
      const entry = owned(owner, id);
      if (!entry) return 'closed';
      if (!isActive(entry.workspaceId)) return 'workspace-unavailable';
      if (!entry.session || entry.preparing || entry.session.status === 'running') return 'busy';
      const session = entry.session;
      const active = () => !entry.closed && isActive(entry.workspaceId);
      let checkpoint: GitCheckpoint | null = null;
      let checkpointWarning: GitError | undefined;
      if (deps.prepareTurn) {
        if (isWorkspaceBusy(entry.workspaceId) || othersBusy(entry.workspaceId)) return 'busy';
        entry.preparing = true;
        try {
          checkpoint = await deps.prepareTurn(
            entry.root,
            entry.workspaceId,
            active,
            !entry.firstTurnStarted,
          );
        } catch (error) {
          if (entry.closed) return 'closed';
          const failure = error instanceof GitFailure ? error : undefined;
          const code = failure?.reason ?? 'failed';
          if (!active() || code === 'workspace-unavailable') return 'workspace-unavailable';
          if (code === 'busy') return 'checkpoint-busy';
          if (code === 'failed' || code === 'too-large') {
            deps.report({
              origin: 'main',
              source: 'git',
              kind: setupKind,
              name: 'CheckpointFailed',
              message: `Could not save the Git checkpoint (${failure?.detail ?? code})`,
            });
          }
          checkpointWarning = code;
        } finally {
          entry.preparing = false;
        }
        if (entry.closed) return 'closed';
        if (!active()) return 'workspace-unavailable';
      }
      const record = entry.record;
      const earlyRecords: ClaudeHistoryRecord[] = [];
      // The session may emit events synchronously before reporting whether it started the turn.
      entry.record = (event) => earlyRecords.push(event);
      let result: ClaudeSendResult;
      try {
        result = session.send(text, entry.catalog.current);
      } finally {
        entry.record = record;
      }
      if (result !== 'started') return result;
      entry.firstTurnStarted = true;
      record?.({
        kind: 'prompt',
        text: entry
          .clean(text.slice(0, MAX_CLAUDE_MESSAGE_CHARS))
          .slice(0, MAX_CLAUDE_MESSAGE_CHARS),
      });
      if (checkpoint) record?.({ kind: 'checkpoint', checkpoint });
      if (checkpointWarning) record?.({ kind: 'checkpoint-warning', code: checkpointWarning });
      for (const event of earlyRecords) record?.(event);
      return result;
    },

    isWorkspaceBusy,

    /**
     * Errors a terminal of `owner` found in `workspaceId` (phase 5e): they join the events of
     * that window's open sessions on the same workspace.
     */
    reportErrors(owner: number, workspaceId: string, errors: readonly ErrorDraft[], at: Date) {
      for (const entry of sessions.values())
        if (entry.owner === owner && entry.workspaceId === workspaceId && !entry.closed)
          entry.session?.reportErrors(errors, at);
    },

    respond(
      owner: number | undefined,
      request: { id: string; requestId: string; choice: ClaudePermissionChoice },
      isActive: (workspaceId: string) => boolean,
    ): boolean {
      const entry = owned(owner, request.id);
      if (!entry?.session || !isActive(entry.workspaceId)) return false;
      return entry.session.respond(request.requestId, request.choice);
    },

    /**
     * Model and effort for the session's next turns (phase 5f). Only values of the catalog the
     * session published pass; a turn already running keeps its own.
     */
    configure(
      owner: number | undefined,
      request: { id: string } & AgentConfig,
    ): AgentConfigureResult {
      const entry = owned(owner, request.id);
      // Only once the session is open: its catalog is final then, and nothing overwrites a choice.
      if (!entry?.session) return 'closed';
      const config: AgentConfig = { model: request.model, effort: request.effort };
      if (!accepts(config, entry.catalog)) return 'invalid';
      const current = entry.catalog.current;
      if (current.model === config.model && current.effort === config.effort) return 'applied';
      entry.catalog = { ...entry.catalog, current: config };
      entry.publish({ kind: 'config', id: request.id, catalog: entry.catalog });
      return 'applied';
    },

    interrupt(owner: number | undefined, id: string): boolean {
      return owned(owner, id)?.session?.interrupt() ?? false;
    },

    async close(owner: number | undefined, id: string): Promise<boolean> {
      const entry = owned(owner, id);
      if (!entry) return false;
      await dispose(id, entry);
      return true;
    },

    closeOwner(owner: number): Promise<void> {
      const mine = [...sessions].filter(([, e]) => e.owner === owner);
      return Promise.all(mine.map(([id, e]) => dispose(id, e))).then(() => undefined);
    },

    /** App quit: ends every running process now; the files go at the next start. */
    terminateAll(): void {
      for (const entry of sessions.values()) entry.session?.terminate();
    },

    async closeAll(): Promise<void> {
      const results = await Promise.allSettled([...sessions].map(([id, e]) => dispose(id, e)));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    },

    listHistory: history.list,
    async readHistory(workspaceId: string, id: string) {
      const result = await history.read(workspaceId, id);
      return result && { records: result.records, resumable: result.resume !== undefined };
    },
  };
}
