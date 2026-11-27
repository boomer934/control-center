// One Codex session driven by the main process (phase 5f.1, ADR 0018).
//
// The session is one `codex app-server` process (JSON-RPC over stdio, started without a shell
// under superviseChild) holding one thread: `thread/start` for a new session, `thread/resume` for
// a saved one. Each user message is one `turn/start` with an explicit model and effort; the
// server's notifications go through LiveCodexSession and leave as AgentEvents; its approval
// requests become the same permission prompts as Claude's. Login, sandbox and the thread's files
// belong to the CLI: the app passes the workspace root, `untrusted` approvals and the
// `workspace-write` sandbox, and never writes Codex's configuration.
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import type { ErrorInput } from '@control-center/app-log';
import {
  LiveCodexSession,
  makeTextCleaner,
  toFileRef,
  type AgentEvent,
} from '@control-center/event-schema';
import type { AgentConfig, AgentModel } from '@control-center/ipc-contract';
import {
  MAX_CLAUDE_PARTIAL_CHARS,
  MAX_CLAUDE_PERMISSION_DETAILS,
  MAX_CLAUDE_PERMISSION_REQUESTS,
  type ClaudePermission,
  type ClaudePermissionChoice,
} from '@control-center/ipc-contract/claude';
import { z } from 'zod';
import type { AgentOpenOptions, AgentSession, AgentSessionStatus } from '../agents/service';
import type { Program } from '../claude/cli';
import { ClaudeNativeSessionId } from '../claude/history';
import { killTree, type Teardown } from '../claude/kill-tree';
import { superviseChild } from '../errors/children';
import { codexVersion, TESTED_CODEX_VERSIONS } from './cli';
import {
  codexCatalog,
  codexDefaults,
  codexModelListSchema,
  resolveCodexConfig,
  toAgentModel,
} from './models';
import { createRpcClient, RpcError, type RpcClient } from './rpc';

export interface CodexSessionOptions extends AgentOpenOptions {
  codex: Program;
  /** The app's version, for the `initialize` client info. */
  clientVersion?: string;
  testedVersions?: readonly string[];
  now?: () => Date;
  /** Test seams. */
  timeouts?: { open?: number; turn?: number; interrupt?: number; close?: number };
}

export interface CodexSession extends AgentSession {
  readonly id: string;
  readonly threadId: string;
}

/**
 * What `codex app-server` is asked to run with: approvals for anything not known safe, answered
 * by the user. Without `approvalsReviewer` the CLI applies the user's own setting, which can be
 * `auto_review` (a model approving its own requests): the app never leaves that to the config.
 */
export const CODEX_THREAD_POLICY = {
  approvalPolicy: 'untrusted',
  approvalsReviewer: 'user',
  sandbox: 'workspace-write',
} as const;
/** The same policy restated on every turn: a turn override lasts for the following turns too. */
const CODEX_TURN_POLICY = {
  approvalPolicy: CODEX_THREAD_POLICY.approvalPolicy,
  approvalsReviewer: CODEX_THREAD_POLICY.approvalsReviewer,
} as const;
export const MAX_MESSAGE_CHARS = 100_000;
const MAX_MODEL_PAGES = 4;

const threadResponse = z.looseObject({
  thread: z.looseObject({ id: ClaudeNativeSessionId }),
  model: z.string().nullable().optional(),
  reasoningEffort: z.string().nullable().optional(),
  approvalPolicy: z.unknown(),
  approvalsReviewer: z.unknown(),
  sandbox: z.unknown(),
});
const workspaceWriteSandbox = z.looseObject({ type: z.literal('workspaceWrite') });

/** The policy the server reports for the thread is the one asked for, or the session won't open. */
function checkThreadPolicy(opened: z.infer<typeof threadResponse>): void {
  const wrong: string[] = [];
  if (opened.approvalPolicy !== CODEX_THREAD_POLICY.approvalPolicy) wrong.push('approvalPolicy');
  if (opened.approvalsReviewer !== CODEX_THREAD_POLICY.approvalsReviewer)
    wrong.push('approvalsReviewer');
  if (!workspaceWriteSandbox.safeParse(opened.sandbox).success) wrong.push('sandbox');
  if (wrong.length === 0) return;
  const error = new Error(
    `Codex did not apply the session policy (${wrong.join(', ')}): the session was not opened`,
  );
  error.name = 'CodexPolicyRejected';
  throw error;
}
const turnResponse = z.looseObject({ turn: z.looseObject({ id: z.string().min(1).max(128) }) });
const initializeResponse = z.looseObject({ userAgent: z.string().max(1024) });
const accountResponse = z.looseObject({ account: z.unknown().nullable() });
const configResponse = z.looseObject({
  config: z.looseObject({
    model: z.unknown().optional(),
    model_reasoning_effort: z.unknown().optional(),
  }),
});
const approvalParams = z.looseObject({
  threadId: z.string(),
  turnId: z.string(),
  itemId: z.string().min(1).max(256),
  command: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  grantRoot: z.string().nullable().optional(),
  availableDecisions: z.array(z.unknown()).nullable().optional(),
});
const threadParams = z.looseObject({ threadId: z.string() });
const deltaParams = z.looseObject({ delta: z.string() });
const resolvedParams = z.looseObject({ requestId: z.union([z.number(), z.string()]) });
const turnParams = z.looseObject({ turn: z.looseObject({ id: z.string() }) });
const fileItem = z.looseObject({
  item: z.looseObject({
    type: z.literal('fileChange'),
    id: z.string(),
    changes: z.array(z.looseObject({ path: z.string() })).max(1000),
  }),
});

const APPROVALS = {
  'item/commandExecution/requestApproval': 'shell',
  'item/fileChange/requestApproval': 'apply_patch',
} as const;

const warnedVersions = new Set<string>();

/** The user's environment minus Electron's own switches. */
function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!/^ELECTRON_/i.test(k)) out[k] = v;
  return out;
}

const runConfig = (config: AgentConfig) => ({
  model: config.model ?? undefined,
  effort: config.effort ?? undefined,
});

export async function openCodexSession(options: CodexSessionOptions): Promise<CodexSession> {
  const id = options.sessionId;
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const tested = options.testedVersions ?? TESTED_CODEX_VERSIONS;
  const timeouts = {
    open: 30_000,
    turn: 60_000,
    interrupt: 10_000,
    close: 3000,
    ...options.timeouts,
  };
  const clean = makeTextCleaner(options.cwd);
  const live = new LiveCodexSession({ sessionId: id, cwd: options.cwd });
  if (options.resumeConfig) live.restoreConfig(runConfig(options.resumeConfig));
  const report = (input: Omit<ErrorInput, 'origin' | 'source'>) =>
    options.report({ origin: 'child', source: 'child:codex', ...input });

  let status: AgentSessionStatus = 'idle';
  let stopping = false;
  let invalidLines = 0;
  let cliVersion: string | undefined;
  let threadId = '';
  const models: AgentModel[] = [];
  let defaults: AgentConfig = { model: null, effort: null };
  let reportedThread = false;
  let turn:
    { id?: string; interruptRequested: boolean; interruptTimer?: NodeJS.Timeout } | undefined;

  const setStatus = (next: AgentSessionStatus) => {
    if (status === next) return;
    status = next;
    options.onStatus(next);
  };
  const emit = (events: AgentEvent[]) => {
    if (events.length > 0 && status !== 'closed') options.onEvents(events);
  };

  // ── streaming preview of the assistant's text ──
  let partial = '';
  let previewTimer: NodeJS.Timeout | undefined;
  const clearPreview = () => {
    clearTimeout(previewTimer);
    previewTimer = undefined;
    if (!partial) return;
    partial = '';
    options.onPartial('');
  };
  const preview = (delta: string) => {
    if (partial.length >= MAX_CLAUDE_PARTIAL_CHARS) return;
    partial += delta.slice(0, MAX_CLAUDE_PARTIAL_CHARS - partial.length);
    previewTimer ??= setTimeout(() => {
      previewTimer = undefined;
      // Keep the current word buffered until it can be redacted as a whole.
      const completeWords = partial.replace(/\S+$/, '');
      options.onPartial(clean(completeWords).slice(0, MAX_CLAUDE_PARTIAL_CHARS));
    }, 40);
  };

  // ── approvals ──
  const pending = new Map<
    string,
    {
      rpcId: number | string;
      itemId: string;
      tool: string;
      canRemember: boolean;
      view: ClaudePermission;
    }
  >();
  /** Files of the patches announced by `item/started`: an approval of a patch names none. */
  const patchFiles = new Map<string, string[]>();
  const publishPermissions = () => options.onPermissions([...pending.values()].map((p) => p.view));
  const clearPermissions = (answer?: 'cancel') => {
    if (pending.size === 0) return;
    if (answer) for (const p of pending.values()) rpc.respond(p.rpcId, { decision: answer });
    pending.clear();
    publishPermissions();
  };
  const details = (lines: (string | null | undefined)[]) => {
    const text = clean(lines.filter(Boolean).join('\n'));
    return {
      details: text.slice(0, MAX_CLAUDE_PERMISSION_DETAILS),
      truncated: text.length > MAX_CLAUDE_PERMISSION_DETAILS,
    };
  };
  const onApproval = (rpcId: number | string, tool: 'shell' | 'apply_patch', raw: unknown) => {
    const params = approvalParams.safeParse(raw);
    if (
      !params.success ||
      params.data.threadId !== threadId ||
      // only the turn the server confirmed (turn/start answer or turn/started) can ask
      turn?.id === undefined ||
      params.data.turnId !== turn.id ||
      pending.size >= MAX_CLAUDE_PERMISSION_REQUESTS
    ) {
      rpc.respond(rpcId, { decision: 'decline' });
      return;
    }
    const p = params.data;
    const offered = p.availableDecisions;
    const canRemember = offered ? offered.includes('acceptForSession') : tool === 'apply_patch';
    const files = (patchFiles.get(p.itemId) ?? []).map((f) => toFileRef(options.cwd, f).path);
    const requestId = randomUUID();
    const view: ClaudePermission = {
      requestId,
      tool: tool === 'shell' ? 'Shell' : 'Patch',
      ...details([
        p.command,
        ...files,
        p.reason,
        p.grantRoot ? `write access: ${p.grantRoot}` : '',
      ]),
      canRemember,
    };
    pending.set(requestId, { rpcId, itemId: p.itemId, tool, canRemember, view });
    emit(live.approvalRequested({ toolUseId: p.itemId, tool, detail: view.details }, now()));
    publishPermissions();
  };

  // ── the server ──
  const onNotification = (method: string, params: unknown) => {
    const thread = threadParams.safeParse(params);
    if (!thread.success || thread.data.threadId !== threadId) return;
    if (method === 'item/agentMessage/delta') {
      const delta = deltaParams.safeParse(params);
      if (delta.success && turn && !stopping) preview(delta.data.delta);
      return;
    }
    if (method === 'serverRequest/resolved') {
      const resolved = resolvedParams.safeParse(params);
      if (!resolved.success) return;
      for (const [key, p] of pending)
        if (p.rpcId === resolved.data.requestId) {
          pending.delete(key);
          publishPermissions();
        }
      return;
    }
    if (method === 'item/started') {
      const patch = fileItem.safeParse(params);
      if (patch.success)
        patchFiles.set(patch.data.item.id, patch.data.item.changes.map((c) => c.path).slice(0, 20));
    }
    if (method === 'turn/started' && turn && turn.id === undefined) {
      const started = turnParams.safeParse(params);
      if (started.success) bindTurn(started.data.turn.id);
    }
    const events = live.notification(method, params, now());
    if (events.some((e) => e.type === 'message.assistant')) clearPreview();
    emit(events);
    if (method === 'turn/completed' && turn) {
      const done = turnParams.safeParse(params);
      if (done.success && done.data.turn.id === turn.id) finishTurn();
    }
  };

  const child: ChildProcess = superviseChild({
    name: 'codex',
    command: options.codex.command,
    args: [...options.codex.args, 'app-server'],
    cwd: options.cwd,
    env: childEnv(options.env ?? process.env),
    stdin: true,
    onStdout: (chunk) => rpc.push(chunk),
    expectedExit: () => stopping,
    report: options.report,
  });
  const rpc: RpcClient = createRpcClient(
    (line) => {
      const input = child.stdin;
      if (!input?.writable) return false;
      input.write(line);
      return true;
    },
    {
      onNotification,
      onRequest: (rpcId, method, params) => {
        const tool = APPROVALS[method as keyof typeof APPROVALS];
        if (tool) onApproval(rpcId, tool, params);
        else rpc.respondError(rpcId, -32601, 'Not supported by this client');
      },
      onInvalid: () => invalidLines++,
    },
  );

  const killFailed = () =>
    report({
      kind: 'child-exit',
      name: 'ProcessTreeNotEnded',
      message:
        'Could not end every process of a Codex session (taskkill failed or did not finish): commands it started may still be running',
    });
  let teardown: Teardown | undefined;
  const exited = new Promise<void>((resolve) => {
    child.on('close', () => {
      rpc.close();
      clearPreview();
      clearPermissions();
      if (invalidLines > 0) {
        report({
          kind: 'child-stderr',
          name: 'InvalidRpcLine',
          message: `Ignored ${invalidLines} stdout line(s) that were not JSON-RPC`,
        });
        invalidLines = 0;
      }
      if (turn) {
        clearTimeout(turn.interruptTimer);
        emit(live.endTurn(now(), stopping ? 'interrupted' : 'process-failed'));
        turn = undefined;
      }
      if (!stopping && status !== 'closed')
        report({
          kind: 'codex-setup',
          name: 'CodexServerExited',
          message: 'The Codex server stopped: reopen the session',
        });
      setStatus('closed');
      resolve();
    });
  });

  // ── the turns ──
  function bindTurn(turnId: string) {
    const current = turn;
    if (!current || current.id !== undefined) return;
    current.id = turnId;
    emit(live.bindTurn(turnId, now()));
    if (!reportedThread) {
      // the thread exists on disk once a turn ran: from here a saved session can resume it
      reportedThread = true;
      options.onSessionId(threadId);
    }
    if (current.interruptRequested) requestInterrupt(current);
  }
  function finishTurn() {
    if (turn) clearTimeout(turn.interruptTimer);
    turn = undefined;
    clearPreview();
    clearPermissions();
    patchFiles.clear();
    if (status === 'running') setStatus('idle');
  }
  function requestInterrupt(current: NonNullable<typeof turn>) {
    if (!current.id) return;
    rpc
      .request('turn/interrupt', { threadId, turnId: current.id }, timeouts.interrupt)
      .catch(() => undefined);
    // A server that never confirms may still be running the turn: the workspace stays busy until
    // the whole process tree is gone (the turn then ends as interrupted on `close`).
    current.interruptTimer ??= setTimeout(() => {
      if (turn !== current || status === 'closed' || stopping) return;
      report({
        kind: 'codex-setup',
        name: 'InterruptNotConfirmed',
        message: 'Codex did not confirm the interrupt: the session was stopped',
      });
      stopping = true;
      teardown?.cancel();
      teardown = killTree(child, killFailed, { wait: true });
    }, timeouts.interrupt);
  }
  const start = (text: string, config: AgentConfig) => {
    const effective = resolveCodexConfig(config, { models, defaults });
    emit(live.startTurn(now(), runConfig(config), effective, cliVersion));
    const current: NonNullable<typeof turn> = { interruptRequested: false };
    turn = current;
    setStatus('running');
    rpc
      .request(
        'turn/start',
        {
          threadId,
          input: [{ type: 'text', text, text_elements: [] }],
          ...CODEX_TURN_POLICY,
          ...(effective.model ? { model: effective.model } : {}),
          ...(effective.effort ? { effort: effective.effort } : {}),
        },
        timeouts.turn,
      )
      .then((value) => {
        const parsed = turnResponse.safeParse(value);
        if (!parsed.success)
          throw new RpcError('turn/start', 'closed', 'Unexpected answer to turn/start');
        bindTurn(parsed.data.turn.id);
      })
      .catch((error: unknown) => {
        if (turn !== current) return;
        emit(live.endTurn(now(), 'failed'));
        finishTurn();
        if (!stopping)
          report({
            kind: 'codex-setup',
            name: 'TurnStartFailed',
            message: `Codex did not start the turn: ${clean(error instanceof Error ? error.message : String(error)).slice(0, 300)}`,
          });
      });
  };

  // ── handshake ──
  const handshake = async () => {
    const init = initializeResponse.safeParse(
      await rpc.request(
        'initialize',
        {
          clientInfo: {
            name: 'vernier',
            title: 'Vernier',
            version: options.clientVersion ?? '0.0.0',
          },
          capabilities: null,
        },
        timeouts.open,
      ),
    );
    cliVersion = init.success ? codexVersion(init.data.userAgent) : undefined;
    if (cliVersion && !tested.includes(cliVersion) && !warnedVersions.has(cliVersion)) {
      warnedVersions.add(cliVersion);
      report({
        kind: 'codex-setup',
        name: 'UntestedCodexVersion',
        message: `Codex ${cliVersion} is not among the tested versions (${tested.join(', ')})`,
      });
    }
    rpc.notify('initialized');
    const account = accountResponse.safeParse(await rpc.request('account/read', {}, timeouts.open));
    if (account.success && account.data.account === null) {
      const error = new Error(
        'Codex is not signed in: run `codex login` or sign in to the Codex app',
      );
      error.name = 'CodexNotSignedIn';
      throw error;
    }
    let cursor: string | null | undefined;
    for (let page = 0; page < MAX_MODEL_PAGES; page++) {
      const list = codexModelListSchema.safeParse(
        await rpc.request('model/list', cursor ? { cursor } : {}, timeouts.open),
      );
      if (!list.success) break;
      for (const entry of list.data.data) {
        const model = toAgentModel(entry);
        if (model && !models.some((m) => m.id === model.id)) models.push(model);
      }
      cursor = list.data.nextCursor;
      if (!cursor) break;
    }
    const config = configResponse.safeParse(
      await rpc.request('config/read', { cwd: options.cwd }, timeouts.open).catch(() => undefined),
    );
    const resume = ClaudeNativeSessionId.safeParse(options.resume).data;
    const opened = threadResponse.parse(
      await rpc.request(
        resume ? 'thread/resume' : 'thread/start',
        {
          ...(resume ? { threadId: resume, excludeTurns: true } : {}),
          cwd: options.cwd,
          ...CODEX_THREAD_POLICY,
        },
        timeouts.open,
      ),
    );
    checkThreadPolicy(opened);
    threadId = opened.thread.id;
    reportedThread = resume !== undefined && resume === threadId;
    defaults = config.success
      ? codexDefaults(config.data.config.model, config.data.config.model_reasoning_effort)
      : codexDefaults(opened.model, opened.reasoningEffort);
  };
  try {
    await handshake();
  } catch (error) {
    stopping = true;
    const down = killTree(child, killFailed);
    await Promise.race([exited, new Promise((r) => setTimeout(r, timeouts.close))]);
    down.abandon();
    throw error;
  }

  return {
    id,
    get threadId() {
      return threadId;
    },
    get status() {
      return status;
    },
    hooks: false,
    send(text, config = { model: null, effort: null }) {
      if (status === 'closed') return 'closed';
      if (turn) return 'busy';
      start(text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text, config);
      return 'started';
    },
    respond(requestId: string, choice: ClaudePermissionChoice) {
      const request = pending.get(requestId);
      if (!request || (choice === 'session' && !request.canRemember)) return false;
      const decision =
        choice === 'approve' ? 'accept' : choice === 'session' ? 'acceptForSession' : 'decline';
      pending.delete(requestId);
      rpc.respond(request.rpcId, { decision });
      emit(
        live.approvalResolved(
          {
            toolUseId: request.itemId,
            tool: request.tool,
            decision: choice === 'deny' ? 'denied' : 'allowed',
          },
          now(),
        ),
      );
      publishPermissions();
      return true;
    },
    reportErrors(errors, at) {
      if (errors.length) emit(live.appErrors(errors, at.toISOString()));
    },
    interrupt() {
      const current = turn;
      if (!current || status === 'closed') return false;
      clearPreview();
      clearPermissions('cancel');
      current.interruptRequested = true;
      requestInterrupt(current);
      return true;
    },
    terminate() {
      if (status === 'closed') return;
      stopping = true;
      teardown?.cancel();
      teardown = killTree(child, killFailed, { wait: true });
    },
    catalog(saved) {
      return codexCatalog(models, defaults, saved);
    },
    restoreConfig(config) {
      live.restoreConfig(runConfig(config));
    },
    async close() {
      if (status === 'closed') return;
      stopping = true;
      if (turn) {
        clearTimeout(turn.interruptTimer);
        emit(live.endTurn(now(), 'interrupted'));
        turn = undefined;
      }
      clearPreview();
      clearPermissions('cancel');
      setStatus('closed');
      child.stdin?.end();
      teardown ??= killTree(child, killFailed);
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.all([exited, teardown.done]),
        new Promise((r) => (timer = setTimeout(r, timeouts.close))),
      ]);
      clearTimeout(timer);
      // nothing of the teardown outlives close(): a late taskkill could name a reused PID
      teardown.abandon();
      rpc.close();
    },
  };
}
