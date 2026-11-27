#!/usr/bin/env node
// A stand-in for `codex app-server`, for tests only: the CI never calls the real service.
//
// It speaks the JSON-RPC of the real server over stdio (one JSON object per line, no `jsonrpc`
// field, as checked against codex-cli 0.171.0-alpha.13.2) and plays a scripted turn for every
// `turn/start`. Markers in the prompt choose the script:
//
//   (none)       a command that reads `notes.txt`, a patch that edits `src/app.ts`, an answer
//   [approve]    the command asks for approval first (decline → the command is declined)
//   [patch]      the patch asks for approval first
//   [hang]       starts answering, then waits for `turn/interrupt`
//   [deaf]       like [hang], but never honours `turn/interrupt`
//   [early]      also asks approval for another turn before answering `turn/start`
//   [reroute]    the provider reroutes the turn to another model
//   [fail]       the turn fails with an error
//
// Environment:
//   FAKE_CODEX_VERSION     version in the `initialize` user agent (default 0.171.0-alpha.13.2)
//   FAKE_CODEX_SIGNED_OUT  1: `account/read` answers no account
//   FAKE_CODEX_REVIEWER    approvals reviewer reported for the thread, whatever the app asked
//   FAKE_CODEX_LOG         file to which every request the app sent is appended, one JSON per line
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const argv = process.argv.slice(2);
if (argv[0] !== 'app-server') {
  process.stderr.write('fake codex: only `app-server` is supported\n');
  process.exit(2);
}
const version = process.env.FAKE_CODEX_VERSION ?? '0.171.0-alpha.13.2';
const log = process.env.FAKE_CODEX_LOG;
const cwd = process.cwd();
const MODELS = [
  {
    id: 'gpt-6.2-sol',
    model: 'gpt-6.2-sol',
    displayName: 'GPT-6.2 Sol',
    hidden: false,
    isDefault: true,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((e) => ({
      reasoningEffort: e,
      description: e,
    })),
  },
  {
    id: 'gpt-6-luna',
    model: 'gpt-6-luna',
    displayName: 'GPT-6 Luna',
    hidden: false,
    isDefault: false,
    defaultReasoningEffort: 'medium',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'].map((e) => ({
      reasoningEffort: e,
      description: e,
    })),
  },
  {
    id: 'internal-preview',
    model: 'internal-preview',
    displayName: 'Hidden',
    hidden: true,
    isDefault: false,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [],
  },
];

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const notify = (method, params) => send({ method, params, emittedAtMs: Date.now() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let threadId;
let nextServerRequest = 0;
const waitingAnswers = new Map();
let current; // { id, interrupted, resolveInterrupt }

/** Sends a server request and waits for the app's answer. */
function ask(method, params) {
  const id = nextServerRequest++;
  return new Promise((resolve) => {
    waitingAnswers.set(id, (answer) => {
      notify('serverRequest/resolved', { threadId, requestId: id });
      resolve(answer);
    });
    send({ id, method, params });
  });
}

const item = (method, turnId, value) =>
  notify(method, {
    item: value,
    threadId,
    turnId,
    startedAtMs: Date.now(),
    completedAtMs: Date.now(),
  });

async function playTurn(turnId, text) {
  const ok = (when) => current?.id === turnId && !current.interrupted && when !== false;
  notify('turn/started', {
    threadId,
    turn: { id: turnId, items: [], status: 'inProgress', error: null },
  });
  const user = {
    type: 'userMessage',
    id: randomUUID(),
    clientId: null,
    content: [{ type: 'text', text, text_elements: [] }],
  };
  item('item/started', turnId, user);
  item('item/completed', turnId, user);
  await sleep(20);
  if (text.includes('[fail]')) {
    notify('error', {
      threadId,
      turnId,
      willRetry: false,
      error: { message: 'The model is unavailable', codexErrorInfo: null },
    });
    return finish(turnId, 'failed', {
      message: 'The model is unavailable',
      codexErrorInfo: null,
      additionalDetails: null,
    });
  }
  if (text.includes('[reroute]'))
    notify('model/rerouted', {
      threadId,
      turnId,
      fromModel: 'gpt-6.2-sol',
      toModel: 'gpt-6-luna',
      reason: 'highRiskCyberActivity',
    });

  const message = {
    type: 'agentMessage',
    id: `msg_${randomUUID()}`,
    text: '',
    phase: 'final_answer',
  };
  item('item/started', turnId, message);
  for (const delta of ['Working ', 'on ', 'it. ']) {
    notify('item/agentMessage/delta', { threadId, turnId, itemId: message.id, delta });
    await sleep(10);
  }
  if (text.includes('[hang]') || text.includes('[deaf]')) {
    await new Promise((resolve) => (current.resolveInterrupt = resolve));
    return;
  }

  const command = {
    type: 'commandExecution',
    id: `exec-${randomUUID()}`,
    command: `"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'notes.txt'"`,
    cwd,
    processId: null,
    source: 'agent',
    status: 'inProgress',
    commandActions: [
      {
        type: 'read',
        command: "Get-Content -LiteralPath 'notes.txt'",
        name: 'notes.txt',
        path: join(cwd, 'notes.txt'),
      },
    ],
    aggregatedOutput: null,
    exitCode: null,
    durationMs: null,
  };
  item('item/started', turnId, command);
  let commandStatus = 'completed';
  if (text.includes('[approve]')) {
    const answer = await ask('item/commandExecution/requestApproval', {
      kind: 'command',
      threadId,
      turnId,
      itemId: command.id,
      startedAtMs: Date.now(),
      environmentId: 'local',
      command: command.command,
      cwd,
      commandActions: command.commandActions,
      availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
    });
    if (!ok()) return;
    const decision = answer?.result?.decision;
    if (decision !== 'accept' && decision !== 'acceptForSession') commandStatus = 'declined';
  }
  item('item/completed', turnId, {
    ...command,
    status: commandStatus,
    aggregatedOutput: commandStatus === 'completed' ? 'hello\n' : null,
    exitCode: commandStatus === 'completed' ? 0 : null,
    durationMs: commandStatus === 'completed' ? 15 : null,
  });

  if (commandStatus === 'completed') {
    const patch = {
      type: 'fileChange',
      id: `patch-${randomUUID()}`,
      status: 'inProgress',
      changes: [
        {
          path: join(cwd, 'src', 'app.ts'),
          kind: { type: 'update', move_path: null },
          diff: '@@ -1 +1,2 @@\n-old\n+new\n+line\n',
        },
      ],
    };
    item('item/started', turnId, patch);
    let patchStatus = 'completed';
    if (text.includes('[patch]')) {
      const answer = await ask('item/fileChange/requestApproval', {
        threadId,
        turnId,
        itemId: patch.id,
        startedAtMs: Date.now(),
        reason: 'Edit the app',
      });
      if (!ok()) return;
      const decision = answer?.result?.decision;
      if (decision !== 'accept' && decision !== 'acceptForSession') patchStatus = 'declined';
    }
    item('item/completed', turnId, { ...patch, status: patchStatus });
  }
  if (!ok()) return;
  item('item/completed', turnId, { ...message, text: `Working on it. Done in ${cwd}.` });
  notify('thread/tokenUsage/updated', {
    threadId,
    turnId,
    tokenUsage: {
      total: {
        totalTokens: 1300,
        inputTokens: 1200,
        cachedInputTokens: 1000,
        cacheWriteInputTokens: 0,
        outputTokens: 100,
        reasoningOutputTokens: 0,
      },
      last: {
        totalTokens: 1300,
        inputTokens: 1200,
        cachedInputTokens: 1000,
        cacheWriteInputTokens: 0,
        outputTokens: 100,
        reasoningOutputTokens: 0,
      },
      modelContextWindow: 258400,
    },
  });
  finish(turnId, 'completed', null);
}

function finish(turnId, status, error) {
  if (current?.id !== turnId) return;
  current = undefined;
  notify('turn/completed', {
    threadId,
    turn: { id: turnId, items: [], status, error, durationMs: 42 },
  });
}

function answer(id, method, params) {
  switch (method) {
    case 'initialize':
      return {
        userAgent: `vernier/${version} (Windows 10.0.26200; x86_64) fake`,
        codexHome: 'C:\\fake-codex-home',
        platformFamily: 'windows',
        platformOs: 'windows',
      };
    case 'account/read':
      return {
        account:
          process.env.FAKE_CODEX_SIGNED_OUT === '1'
            ? null
            : { type: 'chatgpt', email: null, planType: 'plus' },
        requiresOpenaiAuth: true,
      };
    case 'model/list':
      return { data: MODELS, nextCursor: null };
    case 'config/read':
      return {
        config: { model: 'gpt-6.2-sol', model_reasoning_effort: 'high' },
        origins: {},
        layers: null,
      };
    case 'thread/start':
    case 'thread/resume': {
      threadId = method === 'thread/resume' ? params.threadId : randomUUID();
      return {
        thread: { id: threadId, sessionId: threadId, cwd, status: { type: 'idle' }, turns: [] },
        model: 'gpt-6.2-sol',
        modelProvider: 'openai',
        cwd,
        approvalPolicy: params.approvalPolicy ?? 'on-request',
        // like the real CLI, a missing reviewer falls back to the user's config
        approvalsReviewer:
          process.env.FAKE_CODEX_REVIEWER ?? params.approvalsReviewer ?? 'auto_review',
        sandbox: {
          type: params.sandbox === 'workspace-write' ? 'workspaceWrite' : 'readOnly',
          networkAccess: false,
        },
        reasoningEffort: 'high',
      };
    }
    case 'turn/start': {
      if (current) return { error: { code: -32000, message: 'A turn is already running' } };
      const turnId = randomUUID();
      const text = params.input?.[0]?.text ?? '';
      current = { id: turnId, interrupted: false, deaf: text.includes('[deaf]') };
      // an approval for another turn, sent before the app knows this turn's id
      if (text.includes('[early]'))
        void ask('item/commandExecution/requestApproval', {
          threadId,
          turnId: 'not-this-turn',
          itemId: 'exec-early',
          command: 'Remove-Item -Recurse .',
        });
      setTimeout(() => void playTurn(turnId, text), 5);
      return { turn: { id: turnId, items: [], status: 'inProgress', error: null } };
    }
    case 'turn/interrupt': {
      if (current && current.id === params.turnId && !current.deaf) {
        const turn = current;
        turn.interrupted = true;
        setTimeout(() => {
          turn.resolveInterrupt?.();
          finish(turn.id, 'interrupted', null);
        }, 10);
      }
      return {};
    }
    default:
      return { error: { code: -32601, message: `Unknown method ${method}` } };
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (log) appendFileSync(log, JSON.stringify({ ...message, cwd }) + '\n');
  if (message.method === undefined && message.id !== undefined) {
    waitingAnswers.get(message.id)?.(message);
    waitingAnswers.delete(message.id);
    return;
  }
  if (message.id === undefined) return; // notifications (`initialized`)
  const result = answer(message.id, message.method, message.params ?? {});
  if (result && 'error' in result && Object.keys(result).length === 1)
    send({ id: message.id, error: result.error });
  else send({ id: message.id, result });
});
process.stdin.on('end', () => process.exit(0));
