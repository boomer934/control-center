// One Claude Code session driven by the main process.
//
// Each user message is one run: `claude -p --input-format stream-json --output-format
// stream-json`, resumed with `--resume <id>` after the first, started without a shell under
// superviseChild. Its stdout (stream-json) and the hook events delivered by the bridge pipe go
// through the live normalizers of @control-center/event-schema and leave as AgentEvents. The
// session owns its pipe, its token and its temporary files, and removes them when it closes.
import { randomUUID } from 'node:crypto';
import { execFile, execFileSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { LiveClaudeSession, type AgentEvent } from '@control-center/event-schema';
import {
  createBridgeServer,
  newPipeName,
  newToken,
  type BridgeServer,
  type HookPayload,
} from '@control-center/hooks-bridge';
import { z } from 'zod';
import { superviseChild } from '../errors/children';
import { TESTED_CLAUDE_VERSIONS, type Program } from './cli';
import { writeSessionFiles, type HookRunner, type SessionFiles } from './session-files';

export type ClaudeSessionStatus = 'idle' | 'running' | 'closed';
export type SendResult = 'started' | 'busy' | 'closed';

export interface ClaudeSessionOptions {
  /** The app's id of the session (a UUID). Claude's own id is learnt from the first run. */
  sessionId?: string;
  /** Workspace root, already verified by the workspace service. */
  cwd: string;
  /** The app's data folder: the session's temporary files go under it. */
  dataDir: string;
  claude: Program;
  /** How to run the hook script; undefined runs the session on the stream alone. */
  hooks?: HookRunner;
  /** Claude's session id to resume from the first run on. */
  resume?: string;
  env?: NodeJS.ProcessEnv;
  report: (input: ErrorInput) => unknown;
  onEvents: (events: AgentEvent[]) => void;
  onStatus?: (status: ClaudeSessionStatus) => void;
  testedVersions?: readonly string[];
  now?: () => Date;
}

export interface ClaudeSession {
  readonly id: string;
  readonly status: ClaudeSessionStatus;
  /** True when hook events reach the session through the bridge. */
  readonly hooks: boolean;
  /** Claude's own session id, once the first run reported it. */
  readonly claudeSessionId: string | undefined;
  /** Sends a user message: starts a run, unless one is running or the session is closed. */
  send(text: string): SendResult;
  /** Stops the running run. */
  interrupt(): boolean;
  /** Synchronous end of the running run, for app quit: no event is emitted after it. */
  terminate(): void;
  close(): Promise<void>;
}

/** A user message: Claude Code's stream-json input format. */
const userMessage = (text: string) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text }] },
});

/** What every stream-json line must at least be; the normalizers check the rest field by field. */
const streamLineSchema = z.looseObject({ type: z.string().min(1).max(64) });
/** Claude's session id ends up in argv (`--resume`): no leading dash, nothing exotic. */
const CLAUDE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const MAX_LINE_CHARS = 16 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 100_000;

const warnedVersions = new Set<string>();

/**
 * Ends a run with everything it started (hook scripts, the commands of the agent's tools): on
 * Windows killing the process alone would leave its children running in the workspace.
 */
function killTree(child: ChildProcess, wait = false): void {
  const pid = child.pid;
  if (process.platform !== 'win32' || pid === undefined) {
    child.kill();
    return;
  }
  // full path: never a taskkill found on PATH or in the workspace
  const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  const args = ['/PID', String(pid), '/T', '/F'];
  if (wait) {
    // the app is quitting: an asynchronous taskkill would never get to run
    try {
      execFileSync(taskkill, args, { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    } catch {
      child.kill();
    }
    return;
  }
  execFile(taskkill, args, { windowsHide: true }, (error) => {
    if (error) child.kill();
  });
}

/** The user's environment minus Electron's own switches. */
function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!/^ELECTRON_/i.test(k)) out[k] = v;
  return out;
}

export async function openClaudeSession(options: ClaudeSessionOptions): Promise<ClaudeSession> {
  const id = options.sessionId ?? randomUUID();
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const tested = options.testedVersions ?? TESTED_CLAUDE_VERSIONS;
  const live = new LiveClaudeSession({ sessionId: id, cwd: options.cwd });
  const report = (input: Omit<ErrorInput, 'origin' | 'source'> & { source?: string }) =>
    options.report({ origin: 'child', source: 'child:claude', ...input });

  let status: ClaudeSessionStatus = 'idle';
  let claudeSessionId =
    options.resume && CLAUDE_SESSION_ID.test(options.resume) ? options.resume : undefined;
  let run:
    { child: ChildProcess; buffer: string; stopping: boolean; done: Promise<void> } | undefined;

  const setStatus = (next: ClaudeSessionStatus) => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };
  const emit = (events: AgentEvent[]) => {
    // a run that outlives close() (slow kill) must not speak for a session already closed
    if (events.length > 0 && status !== 'closed') options.onEvents(events);
  };

  // ── the bridge: pipe server and session files ──
  let server: BridgeServer | undefined;
  let files: SessionFiles | undefined;
  const onHook = (payload: HookPayload, receivedAt: string) => {
    if (!run) return; // a late hook of a finished run
    emit(live.hook({ capturedAt: receivedAt, payload }));
  };
  if (options.hooks) {
    const config = { v: 1 as const, pipe: newPipeName(), token: newToken() };
    files = await writeSessionFiles(options.dataDir, id, { runner: options.hooks, config });
    if (files.settingsFile) {
      server = createBridgeServer({
        pipe: config.pipe,
        token: config.token,
        onEvent: onHook,
        onReject: (code) =>
          options.report({
            origin: 'main',
            source: 'hooks-bridge',
            kind: 'bridge-rejected',
            name: 'BridgeRejected',
            message: `Refused a hook message (${code})`,
          }),
      });
      try {
        await server.listen();
      } catch (error) {
        await files.remove();
        throw error;
      }
    } else {
      report({
        kind: 'claude-setup',
        name: 'HooksUnavailable',
        message: 'The data folder path cannot be passed to a hook command: hooks are off',
      });
    }
  } else {
    files = await writeSessionFiles(options.dataDir, id, undefined);
  }

  // ── stream-json from stdout ──
  let droppedLines = 0;
  const onLine = (text: string) => {
    if (!text.trim()) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      droppedLines++;
      return;
    }
    const line = streamLineSchema.safeParse(value);
    if (!line.success) {
      droppedLines++;
      return;
    }
    const l = line.data;
    if (l.type === 'system' && l.subtype === 'init') {
      const sid = typeof l.session_id === 'string' ? l.session_id : undefined;
      if (sid && CLAUDE_SESSION_ID.test(sid)) claudeSessionId = sid;
      const version = typeof l.claude_code_version === 'string' ? l.claude_code_version : '';
      if (version && !tested.includes(version) && !warnedVersions.has(version)) {
        warnedVersions.add(version);
        report({
          kind: 'claude-setup',
          name: 'UntestedClaudeVersion',
          message: `Claude Code ${version.slice(0, 40)} is not among the tested versions (${tested.join(', ')})`,
        });
      }
    }
    emit(live.stream(l, now()));
    if (l.type === 'result') run?.child.stdin?.end(); // the turn is over: let the process exit
  };

  const onStdout = (chunk: string) => {
    if (!run) return;
    run.buffer += chunk;
    let nl: number;
    while ((nl = run.buffer.indexOf('\n')) >= 0) {
      const text = run.buffer.slice(0, nl).replace(/\r$/, '');
      run.buffer = run.buffer.slice(nl + 1);
      onLine(text);
    }
    if (run.buffer.length > MAX_LINE_CHARS) {
      run.buffer = '';
      droppedLines++;
    }
  };

  const start = (text: string) => {
    const args = [
      ...options.claude.args,
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      ...(files?.settingsFile ? ['--settings', files.settingsFile] : []),
      ...(claudeSessionId ? ['--resume', claudeSessionId] : []),
    ];
    emit(live.startRun(now()));
    const state = { buffer: '', stopping: false } as NonNullable<typeof run>;
    state.done = new Promise<void>((resolve) => {
      state.child = superviseChild({
        name: 'claude',
        command: options.claude.command,
        args,
        cwd: options.cwd,
        env: childEnv(options.env ?? process.env),
        stdin: true,
        onStdout,
        expectedExit: () => state.stopping,
        report: options.report,
      });
      state.child.on('close', (code) => {
        if (state.buffer) onLine(state.buffer);
        if (droppedLines > 0) {
          report({
            kind: 'child-stderr',
            name: 'InvalidStreamLine',
            message: `Ignored ${droppedLines} stdout line(s) that were not stream-json`,
          });
          droppedLines = 0;
        }
        const reason = state.stopping
          ? 'interrupted'
          : code === 0
            ? 'process-exited'
            : 'process-failed';
        emit(live.endRun(now(), reason));
        if (run === state) run = undefined;
        if (status === 'running') setStatus('idle');
        resolve();
      });
    });
    run = state;
    setStatus('running');
    state.child.stdin?.write(`${JSON.stringify(userMessage(text))}\n`);
  };

  return {
    id,
    get status() {
      return status;
    },
    hooks: server !== undefined,
    get claudeSessionId() {
      return claudeSessionId;
    },
    send(text) {
      if (status === 'closed') return 'closed';
      if (run) return 'busy';
      start(text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text);
      return 'started';
    },
    interrupt() {
      if (!run) return false;
      run.stopping = true;
      killTree(run.child);
      return true;
    },
    terminate() {
      const current = run;
      if (!current) return;
      current.stopping = true;
      killTree(current.child, true);
    },
    async close() {
      if (status === 'closed') return;
      const current = run;
      if (current) {
        current.stopping = true;
        killTree(current.child);
        await Promise.race([current.done, new Promise((r) => setTimeout(r, 3000))]);
      }
      setStatus('closed');
      await server?.close();
      await files?.remove();
    },
  };
}
