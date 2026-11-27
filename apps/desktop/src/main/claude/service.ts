// The Claude sessions of the app's windows, behind the `claude:*` IPC methods: the shared agent
// service (../agents/service.ts) with Claude's program, catalog and session.
import type { ErrorInput } from '@control-center/app-log';
import type { AgentConfig, AgentModel, GitCheckpoint } from '@control-center/ipc-contract';
import { MAX_CLAUDE_SESSIONS, type ClaudeStartResult } from '@control-center/ipc-contract/claude';
import { createAgentService, type AgentSession } from '../agents/service';
import type { Program } from './cli';
import { claudeCatalog, readClaudeDefaults } from './models';
import { openClaudeSession, type ClaudeSessionOptions } from './session';
import { removeStaleSessions, type HookRunner } from './session-files';

export { lastChosenConfig } from '../agents/service';

export interface ClaudeServiceDeps {
  dataDir: string;
  report: (input: ErrorInput) => unknown;
  /** How to run `claude` and the hook script, looked up at each start. */
  programs: () => Promise<{ claude?: Program; hooks?: HookRunner }>;
  env?: NodeJS.ProcessEnv;
  /** Model and effort of the user's Claude Code configuration (phase 5f), read at each start. */
  defaults?: () => Promise<AgentConfig>;
  /** The models Claude Code listed (phase 5h); undefined: the built-in aliases. */
  models?: () => Promise<readonly AgentModel[] | undefined>;
  /** What a session's `system/init` line listed (phase 5h.2), for the capability inventory. */
  onCapabilities?: ClaudeSessionOptions['onCapabilities'];
  open?: typeof openClaudeSession;
  prepareTurn?: (
    root: string,
    workspaceId: string,
    active: () => boolean,
    create: boolean,
  ) => Promise<GitCheckpoint | null>;
}

const NO_CONFIG: AgentConfig = { model: null, effort: null };

export function createClaudeService(deps: ClaudeServiceDeps) {
  const open = deps.open ?? openClaudeSession;
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
  let hooks: HookRunner | undefined;
  const service = createAgentService<Program>({
    provider: 'claude',
    dataDir: deps.dataDir,
    report: deps.report,
    maxSessions: MAX_CLAUDE_SESSIONS,
    env: deps.env,
    prepareTurn: deps.prepareTurn,
    beforeFirstStart: cleaned,
    program: async () => {
      const found = await deps.programs();
      hooks = found.hooks;
      return found.claude;
    },
    catalog: async (saved) => {
      const [defaults, models] = await Promise.all([
        (deps.defaults ?? readClaudeDefaults)().catch(() => NO_CONFIG),
        deps.models?.().catch(() => undefined),
      ]);
      return claudeCatalog(defaults, saved, models);
    },
    open: (options, claude) =>
      open({
        ...options,
        claude,
        hooks,
        onCapabilities: deps.onCapabilities,
      }) as Promise<AgentSession>,
  });
  return {
    ...service,
    start: service.start as (
      ...args: Parameters<typeof service.start>
    ) => Promise<ClaudeStartResult>,
  };
}
