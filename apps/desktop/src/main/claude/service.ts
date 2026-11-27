// The Claude sessions of the app's windows, behind the `claude:*` IPC methods.
//
// Like the terminals (4.2), every session belongs to the window that opened it (`owner`): only
// that window can drive it, only that window receives its updates, and the session closes with
// the window. A message is sent only while the session's workspace is still the active one.
import { randomUUID } from 'node:crypto';
import type { ErrorInput } from '@control-center/app-log';
import { makeTextCleaner, type AgentEvent, type ErrorDraft } from '@control-center/event-schema';
import type { GitCheckpoint, GitError } from '@control-center/ipc-contract';
import { GitFailure } from '../git/repository';
import {
  CLAUDE_EVENTS_PER_UPDATE,
  MAX_CLAUDE_MESSAGE_CHARS,
  MAX_CLAUDE_SESSIONS,
  type ClaudeHistoryRecord,
  type ClaudePermissionChoice,
  type ClaudeSendResult,
  type ClaudeStartResult,
  type ClaudeUpdate,
} from '@control-center/ipc-contract/claude';
import type { Program } from './cli';
import { createClaudeHistory } from './history';
import { openClaudeSession, type ClaudeSession } from './session';
import { removeStaleSessions, type HookRunner } from './session-files';

type Publish = (update: ClaudeUpdate) => void;

export interface ClaudeServiceDeps {
  dataDir: string;
  report: (input: ErrorInput) => unknown;
  /** How to run `claude` and the hook script, looked up at each start. */
  programs: () => Promise<{ claude?: Program; hooks?: HookRunner }>;
  env?: NodeJS.ProcessEnv;
  open?: typeof openClaudeSession;
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
  session?: ClaudeSession;
  opening?: Promise<ClaudeSession>;
  closed: boolean;
  closing?: Promise<void>;
}

export function createClaudeService(deps: ClaudeServiceDeps) {
  const open = deps.open ?? openClaudeSession;
  const sessions = new Map<string, Entry>();
  const history = createClaudeHistory(deps.dataDir);
  // folders left by a crash go before the first session writes its own
  const cleaned = removeStaleSessions(deps.dataDir).then(
    ({ failed }) => {
      if (failed > 0) reportStale(`${failed} old session folder(s) could not be removed`);
    },
    () => reportStale('The old session folders could not be read'),
  );
  function reportStale(message: string) {
    // a left-over folder may still hold a bridge token: the user should know it is there
    deps.report({
      origin: 'main',
      source: 'claude',
      kind: 'claude-setup',
      name: 'StaleSessionCleanupFailed',
      message,
    });
  }

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
    ): Promise<ClaudeStartResult> {
      const { id, workspaceId } = request;
      if (sessions.has(id) || sessions.size >= MAX_CLAUDE_SESSIONS) return 'limit';
      const historyId = request.historyId ?? randomUUID();
      if ([...sessions.values()].some((entry) => entry.historyId === historyId))
        return 'history-unavailable';
      const clean = makeTextCleaner(cwd);
      const entry: Entry = { owner, workspaceId, root: cwd, historyId, clean, closed: false };
      sessions.set(id, entry);
      try {
        await cleaned;
        const previous = request.historyId ? await history.read(workspaceId, historyId) : null;
        if (request.historyId && !previous?.resume) {
          release(id, entry);
          return 'history-unavailable';
        }
        const { claude, hooks } = await deps.programs();
        if (entry.closed) return 'failed';
        if (!claude) {
          release(id, entry);
          return 'claude-unavailable';
        }
        let hooksOn = false;
        const write = history.writer(workspaceId, historyId, previous !== null, () =>
          deps.report({
            origin: 'main',
            source: 'claude',
            kind: 'claude-setup',
            name: 'HistoryWriteFailed',
            message: 'Could not save Claude session history',
          }),
        );
        entry.record = (record) => {
          write(record);
          publish({ ...record, id });
        };
        entry.opening = open({
          sessionId: id,
          cwd,
          dataDir: deps.dataDir,
          claude,
          hooks,
          resume: previous?.resume,
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
        });
        const session = await entry.opening;
        // The disposer is responsible for closing a session that finishes opening late.
        if (entry.closed) return 'failed';
        entry.opening = undefined;
        hooksOn = session.hooks;
        entry.session = session;
        publish({ kind: 'status', id, status: 'idle', hooks: hooksOn });
        return 'started';
      } catch (error) {
        release(id, entry);
        deps.report({
          origin: 'main',
          source: 'claude',
          kind: 'claude-setup',
          name: error instanceof Error ? error.name : 'Error',
          message: `Could not open a Claude session: ${error instanceof Error ? error.message : String(error)}`,
        });
        return 'failed';
      }
    },

    async send(
      owner: number | undefined,
      id: string,
      text: string,
      isActive: (workspaceId: string) => boolean,
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
        if (isWorkspaceBusy(entry.workspaceId)) return 'busy';
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
              kind: 'claude-setup',
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
        result = session.send(text);
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
     * that window's open sessions on the same workspace, so the timeline and the history keep
     * them next to what the agent did before.
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
