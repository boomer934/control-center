import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentConfig } from '@control-center/ipc-contract';
import type { ClaudeUpdate } from '@control-center/ipc-contract/claude';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '../agents/service';
import { codexCatalog } from './models';
import { createCodexService } from './service';
import type { openCodexSession } from './session';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const WS = 'b'.repeat(64);
const MODELS = [
  { id: 'gpt-6.2-sol', label: 'Sol', efforts: ['low', 'high', 'ultra'], defaultEffort: 'low' },
  { id: 'gpt-6-luna', label: 'Luna', efforts: ['low', 'medium'], defaultEffort: 'medium' },
];
const DEFAULTS: AgentConfig = { model: 'gpt-6.2-sol', effort: 'high' };

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(
  program: { command: string; args: string[] } | null = { command: 'codex.exe', args: [] },
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'cc-codex-svc-'));
  dirs.push(dataDir);
  const send = vi.fn((_text: string, _config?: AgentConfig) => 'started' as const);
  const restoreConfig = vi.fn();
  let status: 'idle' | 'running' | 'closed' = 'idle';
  const opened: Parameters<typeof openCodexSession>[0][] = [];
  const open = (async (options: Parameters<typeof openCodexSession>[0]) => {
    opened.push(options);
    const session: AgentSession = {
      get status() {
        return status;
      },
      hooks: false,
      send,
      respond: () => true,
      reportErrors: () => {},
      interrupt: () => true,
      terminate: () => {},
      close: async () => {},
      catalog: (saved) => codexCatalog(MODELS, DEFAULTS, saved),
      restoreConfig,
    };
    return session;
  }) as unknown as typeof openCodexSession;
  const service = createCodexService({
    dataDir,
    report: () => {},
    program: async () => program ?? undefined,
    open,
  });
  const updates: ClaudeUpdate[] = [];
  return {
    dataDir,
    service,
    send,
    opened,
    restoreConfig,
    updates,
    publish: (u: ClaudeUpdate) => updates.push(u),
    setStatus: (s: typeof status) => (status = s),
  };
}

describe('createCodexService', () => {
  it('publishes the catalog of the session and checks choices against it', async () => {
    const h = setup();
    expect(await h.service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', h.publish)).toBe(
      'started',
    );
    expect(h.opened[0]).toMatchObject({ codex: { command: 'codex.exe' }, cwd: 'C:\\ws' });
    expect(h.updates.find((u) => u.kind === 'config')).toMatchObject({
      catalog: { models: MODELS, defaults: DEFAULTS, current: { model: null, effort: null } },
    });
    // the effort is checked on the configured model when none is chosen
    expect(h.service.configure(1, { id: ID, model: null, effort: 'medium' })).toBe('invalid');
    expect(h.service.configure(1, { id: ID, model: null, effort: 'ultra' })).toBe('applied');
    expect(h.service.configure(1, { id: ID, model: 'gpt-6-luna', effort: 'ultra' })).toBe(
      'invalid',
    );
    expect(h.service.configure(2, { id: ID, model: 'gpt-6-luna', effort: null })).toBe('closed');
    expect(h.service.configure(1, { id: ID, model: 'gpt-6-luna', effort: null })).toBe('applied');
    expect(await h.service.send(1, ID, 'hi', () => true)).toBe('started');
    expect(h.send).toHaveBeenCalledWith('hi', { model: 'gpt-6-luna', effort: null });
  });

  it('says when codex is missing', async () => {
    const h = setup(null);
    expect(await h.service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', h.publish)).toBe(
      'codex-unavailable',
    );
  });

  it('waits for a Claude turn on the same workspace when it takes a checkpoint', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'cc-codex-svc-'));
    dirs.push(dataDir);
    const base = setup();
    const service = createCodexService({
      dataDir,
      report: () => {},
      program: async () => ({ command: 'codex.exe', args: [] }),
      open: (async (o: Parameters<typeof openCodexSession>[0]) => {
        base.opened.push(o);
        return {
          status: 'idle',
          hooks: false,
          send: base.send,
          respond: () => true,
          reportErrors: () => {},
          interrupt: () => true,
          terminate: () => {},
          close: async () => {},
        } satisfies AgentSession;
      }) as unknown as typeof openCodexSession,
      prepareTurn: async () => null,
    });
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', base.publish);
    expect(
      await service.send(
        1,
        ID,
        'hi',
        () => true,
        () => true,
      ),
    ).toBe('busy');
    expect(
      await service.send(
        1,
        ID,
        'hi',
        () => true,
        () => false,
      ),
    ).toBe('started');
  });

  it('keeps its history apart from Claude and restores the last valid choice', async () => {
    const h = setup();
    await h.service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', h.publish);
    h.service.configure(1, { id: ID, model: 'gpt-6-luna', effort: 'low' });
    await h.service.send(1, ID, 'hi', () => true);
    // the session reports its events and its thread id as Codex would
    const options = h.opened[0]!;
    options.onSessionId('01a21e97-6223-7a62-857e-ebdd926bb3d2');
    options.onEvents([
      {
        schemaVersion: 3,
        id: `${ID}:0`,
        sessionId: ID,
        seq: 0,
        timestamp: new Date().toISOString(),
        source: 'app',
        provider: 'codex',
        agentId: 'main',
        type: 'session.configChanged',
        model: 'gpt-6-luna',
        effort: 'low',
        by: 'user',
      },
    ]);
    await h.service.close(1, ID);
    expect(existsSync(join(h.dataDir, 'codex-history', WS))).toBe(true);
    expect(existsSync(join(h.dataDir, 'claude-history'))).toBe(false);
    const [saved] = await h.service.listHistory(WS);
    expect(saved).toBeDefined();
    const again = setup();
    // same data folder: a second service reads what the first wrote
    const service = createCodexService({
      dataDir: h.dataDir,
      report: () => {},
      program: async () => ({ command: 'codex.exe', args: [] }),
      open: (async (o: Parameters<typeof openCodexSession>[0]) => {
        again.opened.push(o);
        return {
          status: 'idle',
          hooks: false,
          send: again.send,
          respond: () => true,
          reportErrors: () => {},
          interrupt: () => true,
          terminate: () => {},
          close: async () => {},
          catalog: (s: AgentConfig | undefined) => codexCatalog(MODELS, DEFAULTS, s),
          restoreConfig: again.restoreConfig,
        } satisfies AgentSession;
      }) as unknown as typeof openCodexSession,
    });
    expect(
      await service.start(
        1,
        { id: ID, workspaceId: WS, historyId: saved!.id },
        'C:\\ws',
        again.publish,
      ),
    ).toBe('started');
    expect(again.opened[0]?.resume).toBe('01a21e97-6223-7a62-857e-ebdd926bb3d2');
    expect(again.restoreConfig).toHaveBeenCalledWith({ model: 'gpt-6-luna', effort: 'low' });
    expect(again.updates.find((u) => u.kind === 'config')).toMatchObject({
      catalog: { current: { model: 'gpt-6-luna', effort: 'low' } },
    });
  });
});
