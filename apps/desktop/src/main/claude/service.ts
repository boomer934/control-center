// The Claude sessions of the app's windows, behind the `claude:*` IPC methods.
//
// Like the terminals (4.2), every session belongs to the window that opened it (`owner`): only
// that window can drive it, only that window receives its updates, and the session closes with
// the window. A message is sent only while the session's workspace is still the active one.
import type { ErrorInput } from '@control-center/app-log';
import type { AgentEvent } from '@control-center/event-schema';
import {
  CLAUDE_EVENTS_PER_UPDATE,
  MAX_CLAUDE_SESSIONS,
  type ClaudeSendResult,
  type ClaudeStartResult,
  type ClaudeUpdate,
} from '@control-center/ipc-contract/claude';
import type { Program } from './cli';
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
}

interface Entry {
  owner: number;
  workspaceId: string;
  session?: ClaudeSession;
  closed: boolean;
}

export function createClaudeService(deps: ClaudeServiceDeps) {
  const open = deps.open ?? openClaudeSession;
  const sessions = new Map<string, Entry>();
  // folders left by a crash go before the first session writes its own
  const cleaned = removeStaleSessions(deps.dataDir).catch(() => 0);

  const owned = (owner: number | undefined, id: string) => {
    const entry = sessions.get(id);
    return entry && entry.owner === owner ? entry : undefined;
  };

  const dispose = async (id: string, entry: Entry) => {
    entry.closed = true;
    sessions.delete(id);
    await entry.session?.close();
  };

  return {
    async start(
      owner: number,
      request: { id: string; workspaceId: string },
      cwd: string,
      publish: Publish,
    ): Promise<ClaudeStartResult> {
      const { id, workspaceId } = request;
      if (sessions.has(id) || sessions.size >= MAX_CLAUDE_SESSIONS) return 'limit';
      const entry: Entry = { owner, workspaceId, closed: false };
      sessions.set(id, entry);
      try {
        await cleaned;
        const { claude, hooks } = await deps.programs();
        if (!claude) {
          sessions.delete(id);
          return 'claude-unavailable';
        }
        let hooksOn = false;
        const session = await open({
          sessionId: id,
          cwd,
          dataDir: deps.dataDir,
          claude,
          hooks,
          env: deps.env,
          report: deps.report,
          onEvents: (events: AgentEvent[]) => {
            for (let i = 0; i < events.length; i += CLAUDE_EVENTS_PER_UPDATE)
              publish({
                kind: 'events',
                id,
                events: events.slice(i, i + CLAUDE_EVENTS_PER_UPDATE),
              });
          },
          onStatus: (status) => publish({ kind: 'status', id, status, hooks: hooksOn }),
        });
        hooksOn = session.hooks;
        if (entry.closed) {
          // the window went away while the session was opening
          await session.close();
          return 'failed';
        }
        entry.session = session;
        publish({ kind: 'status', id, status: 'idle', hooks: hooksOn });
        return 'started';
      } catch (error) {
        sessions.delete(id);
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

    send(
      owner: number | undefined,
      id: string,
      text: string,
      isActive: (workspaceId: string) => boolean,
    ): ClaudeSendResult {
      const entry = owned(owner, id);
      if (!entry) return 'closed';
      if (!isActive(entry.workspaceId)) return 'workspace-unavailable';
      if (!entry.session) return 'busy';
      return entry.session.send(text);
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

    closeAll(): Promise<void> {
      return Promise.all([...sessions].map(([id, e]) => dispose(id, e))).then(() => undefined);
    },
  };
}
