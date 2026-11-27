// Manual smoke test with the REAL claude CLI: one short run that reads a file. Skipped unless
// CC_REAL_CLAUDE=1 (it uses the signed-in account; the CI never runs it). Run it when a new Claude
// Code version comes out, then add the version to TESTED_CLAUDE_VERSIONS:
//   CC_REAL_CLAUDE=1 npx vitest run apps/desktop/src/main/claude/real-claude.smoke.test.ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { agentEventSchema, type AgentEvent } from '@control-center/event-schema';
import { expect, it } from 'vitest';
import { probeClaude } from './catalog';
import { resolveClaude, resolveHookNode } from './cli';
import { openClaudeSession } from './session';

const HOOK_SCRIPT = join(__dirname, '../../../../../packages/hooks-bridge/src/bin.ts');

it.skipIf(process.env.CC_REAL_CLAUDE !== '1')(
  'a real claude run delivers its hooks through the bridge',
  async () => {
    const claude = resolveClaude();
    const node = await resolveHookNode();
    expect(claude, 'claude on PATH').toBeDefined();
    expect(node, 'Node ≥ 22.18 on PATH').toBeDefined();
    if (!claude || !node) return;
    const ws = mkdtempSync(join(tmpdir(), 'cc-real-'));
    const data = mkdtempSync(join(tmpdir(), 'cc-real-data-'));
    try {
      writeFileSync(join(ws, 'hello.txt'), 'banana split\n');
      const events: AgentEvent[] = [];
      const reports: ErrorInput[] = [];
      let wake = () => {};
      const idle = new Promise<void>((r) => (wake = r));
      const session = await openClaudeSession({
        cwd: ws,
        dataDir: data,
        claude,
        hooks: { node, script: HOOK_SCRIPT },
        report: (r) => reports.push(r),
        onEvents: (e) => events.push(...e),
        onStatus: (s) => s === 'idle' && wake(),
      });
      expect(session.hooks).toBe(true);
      session.send('Use the Read tool on hello.txt, then reply with its first word only.');
      await idle;
      await session.close();

      for (const e of events) expect(agentEventSchema.safeParse(e).success, e.type).toBe(true);
      expect(events[0]).toMatchObject({ type: 'session.started', source: 'stream' });
      expect(events[0]).toHaveProperty('cliVersion');
      expect(events.at(-1)).toMatchObject({ type: 'session.ended', ok: true });
      // the hooks reached the app: Claude Code ran the quoted command and the pipe accepted it
      expect(events.some((e) => e.source === 'hooks')).toBe(true);
      expect(events.some((e) => e.type === 'file.read')).toBe(true);
      expect(reports.filter((r) => r.kind === 'bridge-rejected')).toEqual([]);
    } finally {
      rmSync(ws, { recursive: true, force: true });
      rmSync(data, { recursive: true, force: true });
    }
  },
  180_000,
);

it.skipIf(process.env.CC_REAL_CLAUDE !== '1')(
  'a real claude lists its models and capabilities through initialize, without a turn',
  async () => {
    const claude = resolveClaude();
    expect(claude, 'claude on PATH').toBeDefined();
    if (!claude) return;
    const data = mkdtempSync(join(tmpdir(), 'cc-real-probe-'));
    try {
      const found = await probeClaude({
        claude,
        cwd: data,
        env: process.env,
        report: () => undefined,
      });
      expect(found?.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(found?.models.length).toBeGreaterThan(0);
      expect(found?.capabilities.some((c) => c.kind === 'command')).toBe(true);
      // nothing of the account leaves the probe
      expect(JSON.stringify(found)).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    } finally {
      rmSync(data, { recursive: true, force: true, maxRetries: 5 });
    }
  },
  60_000,
);
