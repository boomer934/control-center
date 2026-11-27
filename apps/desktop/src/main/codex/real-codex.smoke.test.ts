// Manual smoke test with the REAL `codex app-server`: a turn that needs an approval, an
// interrupted turn, then a resumed thread that remembers the first turn. Skipped unless
// CC_REAL_CODEX=1 (it uses the signed-in Codex account; the CI never runs it). Run it when a new
// Codex version comes out, then add the version to TESTED_CODEX_VERSIONS:
//   CC_REAL_CODEX=1 npx vitest run apps/desktop/src/main/codex/real-codex.smoke.test.ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { agentEventSchema, type AgentEvent } from '@control-center/event-schema';
import type { ClaudePermission } from '@control-center/ipc-contract/claude';
import { expect, it } from 'vitest';
import { resolveCodex } from './cli';
import { openCodexSession, type CodexSession } from './session';

const MODEL = process.env.CC_REAL_CODEX_MODEL ?? 'gpt-6-luna';

it.skipIf(process.env.CC_REAL_CODEX !== '1')(
  'a real Codex thread asks for approval, stops on interrupt and resumes',
  async () => {
    const codex = await resolveCodex();
    expect(codex, 'codex on PATH or the Codex app').toBeDefined();
    if (!codex) return;
    const ws = mkdtempSync(join(tmpdir(), 'cc-real-codex-'));
    writeFileSync(join(ws, 'hello.txt'), 'banana split\n');
    const reports: ErrorInput[] = [];
    const sessions: CodexSession[] = [];
    try {
      const open = async (resume?: string) => {
        const events: AgentEvent[] = [];
        const ids: string[] = [];
        let wake = () => {};
        let onPrompt: (p: ClaudePermission) => void = () => {};
        let onText: () => void = () => {};
        const session = await openCodexSession({
          sessionId: crypto.randomUUID(),
          cwd: ws,
          dataDir: ws,
          codex,
          resume,
          report: (r) => reports.push(r),
          onEvents: (e) => events.push(...e),
          onStatus: (s) => s !== 'running' && wake(),
          onPermissions: (requests) => requests[0] && onPrompt(requests[0]),
          onPartial: (text) => text && onText(),
          onSessionId: (id) => ids.push(id),
        });
        sessions.push(session);
        return {
          session,
          events,
          ids,
          idle: () => new Promise<void>((r) => (wake = r)),
          prompt: () => new Promise<ClaudePermission>((r) => (onPrompt = r)),
          text: () => new Promise<void>((r) => (onText = r)),
        };
      };

      const a = await open();
      expect(a.session.catalog?.(undefined).models.length).toBeGreaterThan(0);
      let idle = a.idle();
      const prompt = a.prompt();
      a.session.send(
        'Create a file named note.txt containing the single word ok, using a shell command. Then reply with one short sentence.',
        { model: MODEL, effort: 'low' },
      );
      const request = await prompt;
      expect(a.session.respond(request.requestId, 'approve')).toBe(true);
      await idle;
      expect(readFileSync(join(ws, 'note.txt'), 'utf8').trim()).toBe('ok');
      for (const e of a.events) expect(agentEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(a.events[0]).toMatchObject({
        type: 'session.configChanged',
        model: MODEL,
        by: 'user',
      });
      expect(a.events.find((e) => e.type === 'session.started')).toHaveProperty('cliVersion');
      expect(a.events.some((e) => e.type === 'permission.resolved')).toBe(true);
      expect(a.events.at(-1)).toMatchObject({ type: 'session.ended', ok: true });
      expect(a.ids).toHaveLength(1);

      idle = a.idle();
      const text = a.text();
      a.session.send('Count from 1 to 300, one number per line, with a sentence about each.', {
        model: MODEL,
        effort: 'low',
      });
      // interrupt as soon as the answer starts streaming
      await text;
      expect(a.session.interrupt()).toBe(true);
      await idle;
      expect(a.events.at(-1)).toMatchObject({
        type: 'session.ended',
        ok: false,
        reason: 'interrupted',
      });
      await a.session.close();

      const b = await open(a.ids[0]);
      expect(b.session.threadId).toBe(a.ids[0]);
      idle = b.idle();
      b.session.send(
        'Which word did you write into note.txt earlier? Answer with that word only.',
        {
          model: MODEL,
          effort: 'low',
        },
      );
      await idle;
      const answer = b.events.filter((e) => e.type === 'message.assistant').at(-1);
      expect(answer && 'text' in answer ? answer.text.toLowerCase() : '').toContain('ok');
      await b.session.close();
      expect(reports.filter((r) => r.kind === 'codex-setup')).toEqual([]);
    } finally {
      for (const s of sessions) await s.close();
      if (existsSync(ws))
        rmSync(ws, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  },
  300_000,
);

// The capability probe (phase 5h.2) against the real CLI: read-only methods, no thread, no turn.
//   CC_REAL_CODEX=1 npx vitest run apps/desktop/src/main/codex/real-codex.smoke.test.ts -t probe
it.skipIf(process.env.CC_REAL_CODEX !== '1')(
  'the probe lists what the real Codex offers',
  async () => {
    const { probeCodex } = await import('./discovery');
    const codex = await resolveCodex();
    expect(codex, 'codex on PATH or the Codex app').toBeDefined();
    if (!codex) return;
    const dir = mkdtempSync(join(tmpdir(), 'cc-real-codex-probe-'));
    try {
      const reports: ErrorInput[] = [];
      const read = await probeCodex({
        codex,
        cwd: dir,
        env: process.env,
        report: (r) => reports.push(r),
      });
      expect(read?.version).toBeTruthy();
      const count = (kind: string) => read?.entries.filter((e) => e.kind === kind).length ?? 0;
      process.stderr.write(
        `Codex ${read?.version}: kinds ${read?.kinds.join(', ')}; ` +
          ['model', 'feature', 'skill', 'hook', 'plugin', 'mcp', 'tool', 'capability', 'profile']
            .map((k) => `${k} ${count(k)}`)
            .join(', ') +
          '\n',
      );
      expect(read?.kinds).toEqual(
        expect.arrayContaining(['model', 'feature', 'skill', 'plugin', 'mcp', 'profile']),
      );
      expect(reports.filter((r) => r.name === 'CodexMethodRefused')).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  },
  90_000,
);
