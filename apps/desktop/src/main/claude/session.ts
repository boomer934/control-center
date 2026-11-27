// One Claude Code session driven by the main process.
//
// Each user message is one run: `claude -p --input-format stream-json --output-format
// stream-json`, resumed with `--resume <id>` after the first, started without a shell under
// superviseChild. Its stdout (stream-json) and the hook events delivered by the bridge pipe go
// through the live normalizers of @control-center/event-schema and leave as AgentEvents. The
// session owns its pipe, its token and its temporary files, and removes them when it closes.
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import type { ErrorInput } from '@control-center/app-log';
import {
  LiveClaudeSession,
  makeTextCleaner,
  type AgentEvent,
  type ErrorDraft,
} from '@control-center/event-schema';
import type { AgentConfig } from '@control-center/ipc-contract';
import {
  MAX_CLAUDE_PARTIAL_CHARS,
  type ClaudePermission,
  type ClaudePermissionChoice,
} from '@control-center/ipc-contract/claude';
import {
  createBridgeServer,
  newPipeName,
  newToken,
  type BridgeServer,
  type HookPayload,
  type RejectSummary,
} from '@control-center/hooks-bridge';
import { z } from 'zod';
import { superviseChild } from '../errors/children';
import { TESTED_CLAUDE_VERSIONS, type Program } from './cli';
import { killTree, type Teardown } from './kill-tree';
import { ClaudeNativeSessionId } from './history';
import { parseClaudeInitLine } from './catalog';
import { claudeConfigArgs } from './models';
import { createClaudePermissions } from './permissions';
import {
  createSessionDir,
  hookCommand,
  hookSettings,
  type HookRunner,
  type SessionFiles,
} from './session-files';

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
  /** Model and effort the resumed session's last runs used (phase 5f). */
  resumeConfig?: AgentConfig;
  env?: NodeJS.ProcessEnv;
  report: (input: ErrorInput) => unknown;
  onEvents: (events: AgentEvent[]) => void;
  onPermissions?: (requests: ClaudePermission[]) => void;
  onPartial?: (text: string) => void;
  onSessionId?: (id: string) => void;
  onStatus?: (status: ClaudeSessionStatus) => void;
  /**
   * The tools, MCP servers, plugins and skills of the session's first `system/init` line (phase
   * 5h.2), for the capability inventory as an additive read.
   */
  onCapabilities?: (read: NonNullable<ReturnType<typeof parseClaudeInitLine>>) => void;
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
  /**
   * Sends a user message: starts a run, unless one is running or the session is closed. `config`:
   * model and effort of this run (already checked against the catalog); absent, the CLI decides.
   */
  send(text: string, config?: AgentConfig): SendResult;
  respond(requestId: string, choice: ClaudePermissionChoice): boolean;
  /** Adds errors the app found in the workspace's output (phase 5e) to the session's events. */
  reportErrors(errors: readonly ErrorDraft[], at: Date): void;
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
const textDelta = z.looseObject({
  parent_tool_use_id: z.null().optional(),
  event: z.looseObject({
    type: z.literal('content_block_delta'),
    delta: z.looseObject({ type: z.literal('text_delta'), text: z.string() }),
  }),
});

export const MAX_LINE_CHARS = 16 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 100_000;
/** How long close() waits for the run to end before it abandons the teardown. */
const CLOSE_WAIT_MS = 3000;

const warnedVersions = new Set<string>();

const DEFAULT_CONFIG: AgentConfig = { model: null, effort: null };
const runConfig = (config: AgentConfig) => ({
  model: config.model ?? undefined,
  effort: config.effort ?? undefined,
});

/** One Console line for a batch of refused hook messages: codes and counts, nothing else. */
export function describeRejects(summary: RejectSummary): string {
  const parts = Object.entries(summary.counts).map(([code, n]) =>
    n === 1 ? code : `${code} ×${n}`,
  );
  const more = summary.final
    ? ''
    : summary.capped
      ? '; further refusals counted until the session closes'
      : '';
  return `Refused ${summary.total} hook message(s) (${parts.join(', ')})${more}`;
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
  if (options.resumeConfig) live.restoreConfig(runConfig(options.resumeConfig));
  const report = (input: Omit<ErrorInput, 'origin' | 'source'> & { source?: string }) =>
    options.report({ origin: 'child', source: 'child:claude', ...input });

  let status: ClaudeSessionStatus = 'idle';
  let claudeSessionId = ClaudeNativeSessionId.safeParse(options.resume).data;
  let run:
    | {
        child: ChildProcess;
        buffer: string;
        discardingLine: boolean;
        stopping: boolean;
        /** The run's one teardown, shared by interrupt, close and a failed stdin write. */
        teardown?: Teardown;
        done: Promise<void>;
      }
    | undefined;

  const clean = makeTextCleaner(options.cwd);
  const permissions = createClaudePermissions(
    clean,
    (line) => {
      const current = run;
      const input = current?.child.stdin;
      if (!current || current.stopping || !input?.writable) return false;
      input.write(`${line}\n`, (error) => {
        if (error && run === current && !current.stopping) stopRun(current);
      });
      return true;
    },
    (requests) => options.onPermissions?.(requests),
  );
  let partial = '';
  let previewTimer: NodeJS.Timeout | undefined;
  const clearPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = undefined;
    if (!partial) return;
    partial = '';
    options.onPartial?.('');
  };
  const preview = (line: unknown) => {
    const delta = textDelta.safeParse(line);
    if (!delta.success || !options.onPartial || partial.length >= MAX_CLAUDE_PARTIAL_CHARS) return;
    partial += delta.data.event.delta.text.slice(0, MAX_CLAUDE_PARTIAL_CHARS - partial.length);
    if (!previewTimer) {
      previewTimer = setTimeout(() => {
        previewTimer = undefined;
        // Keep the current word buffered until it can be redacted as a whole.
        const completeWords = partial.replace(/\S+$/, '');
        options.onPartial?.(clean(completeWords).slice(0, MAX_CLAUDE_PARTIAL_CHARS));
      }, 40);
    }
  };

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
  /** The hooks, as inline JSON for `--settings`: no settings file on disk. */
  let settingsArg: string | undefined;
  const onHook = (payload: HookPayload, receivedAt: string) => {
    if (!run) return; // a late hook of a finished run
    emit(live.hook({ capturedAt: receivedAt, payload }));
  };
  const files: SessionFiles = await createSessionDir(options.dataDir, id);
  const command = options.hooks && hookCommand(options.hooks, files.bridgeFile);
  if (command) {
    const config = { v: 1 as const, pipe: newPipeName(), token: newToken() };
    const bridge = createBridgeServer({
      pipe: config.pipe,
      token: config.token,
      onEvent: onHook,
      onReject: (summary) =>
        options.report({
          origin: 'main',
          source: 'hooks-bridge',
          kind: 'bridge-rejected',
          name: 'BridgeRejected',
          message: describeRejects(summary),
        }),
    });
    try {
      await bridge.listen();
      // the pipe exists before anyone can learn its name from the bridge file
      await files.writeBridge(config);
    } catch (error) {
      await bridge.close();
      await files.remove();
      throw error;
    }
    server = bridge;
    settingsArg = JSON.stringify(hookSettings(command));
  } else if (options.hooks) {
    report({
      kind: 'claude-setup',
      name: 'HooksUnavailable',
      message: 'The data folder path cannot be passed to a hook command: hooks are off',
    });
  }
  const killFailed = () =>
    report({
      kind: 'child-exit',
      name: 'ProcessTreeNotEnded',
      message:
        'Could not end every process of a Claude run (taskkill failed or did not finish): commands it started may still be running',
    });
  /** Starts the run's teardown, once: a second stop joins the first instead of racing it. */
  const stopRun = (current: NonNullable<typeof run>): Teardown => {
    current.stopping = true;
    current.teardown ??= killTree(current.child, killFailed);
    return current.teardown;
  };

  // ── stream-json from stdout ──
  let droppedLines = 0;
  let initRead = false;
  const onLine = (text: string) => {
    if (text.length > MAX_LINE_CHARS) {
      droppedLines++;
      return;
    }
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
    if (run?.stopping && l.type.startsWith('control_')) return;
    if (permissions.receive(l)) return;
    if (l.type === 'stream_event') {
      if (!run?.stopping) preview(l);
      return;
    }
    if (l.type === 'system' && l.subtype === 'init') {
      const sid = ClaudeNativeSessionId.safeParse(l.session_id);
      if (sid.success && sid.data !== claudeSessionId) {
        claudeSessionId = sid.data;
        options.onSessionId?.(sid.data);
      }
      if (!initRead && options.onCapabilities) {
        initRead = true;
        const read = parseClaudeInitLine(l);
        if (read) options.onCapabilities(read);
      }
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
    const events = live.stream(l, now());
    if (events.some((event) => event.type === 'message.assistant' && event.agentId === 'main'))
      clearPreview();
    emit(events);
    if (l.type === 'result') {
      clearPreview();
      permissions.clear();
      run?.child.stdin?.end(); // the turn is over: let the process exit
    }
  };

  const onStdout = (chunk: string) => {
    if (!run) return;
    if (run.discardingLine) {
      const end = chunk.indexOf('\n');
      if (end < 0) return;
      run.discardingLine = false;
      chunk = chunk.slice(end + 1);
    }
    run.buffer += chunk;
    let nl: number;
    while ((nl = run.buffer.indexOf('\n')) >= 0) {
      const text = run.buffer.slice(0, nl).replace(/\r$/, '');
      run.buffer = run.buffer.slice(nl + 1);
      onLine(text);
    }
    if (run.buffer.length > MAX_LINE_CHARS) {
      run.buffer = '';
      run.discardingLine = true;
      droppedLines++;
    }
  };

  const start = (text: string, config: AgentConfig) => {
    const args = [
      ...options.claude.args,
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      ...(options.onPartial ? ['--include-partial-messages'] : []),
      ...(options.onPermissions ? ['--permission-prompt-tool', 'stdio'] : []),
      ...(settingsArg ? ['--settings', settingsArg] : []),
      ...(claudeSessionId ? ['--resume', claudeSessionId] : []),
      ...claudeConfigArgs(config),
    ];
    emit(live.startRun(now(), runConfig(config)));
    const state = { buffer: '', discardingLine: false, stopping: false } as NonNullable<typeof run>;
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
        clearPreview();
        permissions.clear();
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
    send(text, config = DEFAULT_CONFIG) {
      if (status === 'closed') return 'closed';
      if (run) return 'busy';
      start(text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text, config);
      return 'started';
    },
    respond: permissions.respond,
    reportErrors(errors, at) {
      if (errors.length) emit(live.appErrors(errors, at.toISOString()));
    },
    interrupt() {
      if (!run) return false;
      clearPreview();
      permissions.clear();
      stopRun(run);
      return true;
    },
    terminate() {
      const current = run;
      if (!current) return;
      current.stopping = true;
      current.teardown?.cancel();
      current.teardown = killTree(current.child, killFailed, { wait: true });
    },
    async close() {
      if (status === 'closed') return;
      const current = run;
      if (current) {
        const teardown = stopRun(current);
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
          Promise.all([current.done, teardown.done]),
          new Promise((r) => (timer = setTimeout(r, CLOSE_WAIT_MS))),
        ]);
        clearTimeout(timer);
        // nothing of the teardown outlives close(): a late taskkill could name a reused PID
        teardown.abandon();
      }
      setStatus('closed');
      await server?.close();
      await files.remove();
    },
  };
}
