// The Codex sessions of the app's windows, behind the `codex:*` IPC methods (phase 5f.1): the
// shared agent service with Codex's program, catalog and session.
import type { ErrorInput } from '@control-center/app-log';
import type { GitCheckpoint } from '@control-center/ipc-contract';
import { MAX_CODEX_SESSIONS, type CodexStartResult } from '@control-center/ipc-contract/codex';
import { createAgentService } from '../agents/service';
import type { Program } from '../claude/cli';
import { resolveCodex } from './cli';
import { acceptsCodexConfig } from './models';
import { openCodexSession } from './session';

export interface CodexServiceDeps {
  dataDir: string;
  report: (input: ErrorInput) => unknown;
  /** How to run `codex`, looked up at each start. */
  program?: () => Promise<Program | undefined>;
  clientVersion?: string;
  env?: NodeJS.ProcessEnv;
  /** A session heard that Codex's skills changed (phase 5h.2). */
  onCapabilitiesChanged?: () => void;
  open?: typeof openCodexSession;
  prepareTurn?: (
    root: string,
    workspaceId: string,
    active: () => boolean,
    create: boolean,
  ) => Promise<GitCheckpoint | null>;
}

export function createCodexService(deps: CodexServiceDeps) {
  const open = deps.open ?? openCodexSession;
  const service = createAgentService<Program>({
    provider: 'codex',
    dataDir: deps.dataDir,
    report: deps.report,
    maxSessions: MAX_CODEX_SESSIONS,
    env: deps.env,
    prepareTurn: deps.prepareTurn,
    program: deps.program ?? (() => resolveCodex(deps.env)),
    // The catalog comes from the session's own server (`model/list`) once it is open.
    catalog: async () => ({
      models: [],
      defaults: { model: null, effort: null },
      current: { model: null, effort: null },
    }),
    accepts: acceptsCodexConfig,
    open: (options, codex) =>
      open({
        ...options,
        codex,
        clientVersion: deps.clientVersion,
        onCapabilitiesChanged: deps.onCapabilitiesChanged,
      }),
  });
  return {
    ...service,
    start: service.start as (
      ...args: Parameters<typeof service.start>
    ) => Promise<CodexStartResult>,
  };
}
