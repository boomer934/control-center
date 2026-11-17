import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@control-center/event-schema';
import type { ClaudeUpdate } from '@control-center/ipc-contract/claude';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClaudeService } from './service';
import type { ClaudeSessionOptions, openClaudeSession } from './session';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const WS = 'a'.repeat(64);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(
  programs = {
    claude: { command: 'claude.exe', args: [] } as { command: string; args: string[] } | undefined,
  },
  openGate?: Promise<void>,
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'cc-svc-'));
  dirs.push(dataDir);
  const opened: Array<
    ClaudeSessionOptions & {
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      respond: ReturnType<typeof vi.fn>;
    }
  > = [];
  const open = (async (options: ClaudeSessionOptions) => {
    const send = vi.fn(() => 'started' as const);
    const close = vi.fn(async () => {});
    const respond = vi.fn(() => true);
    opened.push({ ...options, send, close, respond });
    await openGate;
    return {
      id: options.sessionId ?? '',
      status: 'idle' as const,
      hooks: true,
      claudeSessionId: undefined,
      send,
      respond,
      interrupt: () => true,
      terminate: () => {},
      close,
    };
  }) as unknown as typeof openClaudeSession;
  const reports: unknown[] = [];
  const service = createClaudeService({
    dataDir,
    report: (r) => reports.push(r),
    programs: async () => ({ claude: programs.claude, hooks: undefined }),
    open,
  });
  const updates: ClaudeUpdate[] = [];
  return {
    dataDir,
    service,
    opened,
    updates,
    publish: (u: ClaudeUpdate) => updates.push(u),
    reports,
  };
}

const active = () => true;

describe('Claude service', () => {
  it('binds a session to the window that opened it', async () => {
    const { service, opened, publish } = setup();
    await expect(service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish)).resolves.toBe(
      'started',
    );
    expect(opened[0]).toMatchObject({ sessionId: ID, cwd: 'C:\\ws' });
    expect(service.send(2, ID, 'hi', active)).toBe('closed');
    expect(service.interrupt(2, ID)).toBe(false);
    await expect(service.close(2, ID)).resolves.toBe(false);
    expect(opened[0]?.send).not.toHaveBeenCalled();
    expect(service.send(1, ID, 'hi', active)).toBe('started');
    expect(opened[0]?.send).toHaveBeenCalledWith('hi');
    await service.closeAll();
  });

  it('sends only while the session’s workspace is active', async () => {
    const { service, opened, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    expect(service.send(1, ID, 'hi', () => false)).toBe('workspace-unavailable');
    expect(opened[0]?.send).not.toHaveBeenCalled();
  });

  it('accepts permission decisions only from the session owner in the active workspace', async () => {
    const { service, opened, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    const decision = { id: ID, requestId: OTHER, choice: 'approve' as const };
    expect(service.respond(2, decision, active)).toBe(false);
    expect(service.respond(1, decision, () => false)).toBe(false);
    expect(opened[0]?.respond).not.toHaveBeenCalled();
    expect(service.respond(1, decision, active)).toBe(true);
    expect(opened[0]?.respond).toHaveBeenCalledWith(OTHER, 'approve');
  });

  it('refuses a reused id, too many sessions and a missing claude', async () => {
    const { service, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    await expect(service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish)).resolves.toBe(
      'limit',
    );
    for (let i = 1; i < 4; i++)
      await service.start(1, { id: `${ID.slice(0, -1)}${i}`, workspaceId: WS }, 'C:\\ws', publish);
    await expect(service.start(1, { id: OTHER, workspaceId: WS }, 'C:\\ws', publish)).resolves.toBe(
      'limit',
    );

    const none = setup({ claude: undefined });
    await expect(
      none.service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', none.publish),
    ).resolves.toBe('claude-unavailable');
  });

  it('splits event bursts into bounded updates', async () => {
    const { service, opened, updates, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    opened[0]?.onEvents(Array.from({ length: 450 }, () => ({}) as AgentEvent));
    const sizes = updates
      .filter((u) => u.kind === 'events')
      .map((u) => (u.kind === 'events' ? u.events.length : 0));
    expect(sizes).toEqual([200, 200, 50]);
    expect(updates[0]).toEqual({ kind: 'status', id: ID, status: 'idle', hooks: true });
  });

  it('publishes and saves the prompt before synchronous events on every accepted turn', async () => {
    const { service, opened, updates, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    const event = (seq: number): AgentEvent => ({
      schemaVersion: 1,
      type: 'session.started',
      id: `event-${seq}`,
      sessionId: ID,
      seq,
      timestamp: '2026-11-18T10:00:00.000Z',
      source: 'stream',
      provider: 'claude',
      agentId: 'main',
    });
    const session = opened[0]!;
    session.send.mockImplementationOnce(() => 'busy');
    session.send.mockImplementationOnce(() => {
      session.onEvents([event(0)]);
      throw new Error('Could not spawn Claude');
    });
    let seq = 0;
    session.send.mockImplementation(() => {
      session.onEvents([event(seq++)]);
      return 'started';
    });
    expect(service.send(1, ID, 'skip this', active)).toBe('busy');
    expect(() => service.send(1, ID, 'skip this too', active)).toThrow('Could not spawn Claude');
    expect(service.send(1, ID, 'first prompt', active)).toBe('started');
    expect(service.send(1, ID, 'second prompt', active)).toBe('started');
    const records = [
      { kind: 'prompt', text: 'first prompt' },
      { kind: 'events', events: [event(0)] },
      { kind: 'prompt', text: 'second prompt' },
      { kind: 'events', events: [event(1)] },
    ];
    expect(updates.slice(1)).toEqual(records.map((record) => ({ ...record, id: ID })));
    const [summary] = await service.listHistory(WS);
    expect(summary?.title).toBe('first prompt');
    await expect(service.readHistory(WS, summary!.id)).resolves.toEqual({
      records,
      resumable: false,
    });
  });

  it('isolates history by workspace and ignores an invalid native resume ID', async () => {
    const { dataDir, service, publish } = setup();
    const otherWorkspace = 'b'.repeat(64);
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    await service.start(1, { id: OTHER, workspaceId: otherWorkspace }, 'C:\\other', publish);
    service.send(1, ID, 'private to workspace A', active);
    service.send(1, OTHER, 'private to workspace B', active);
    await service.closeAll();
    const [summary] = await service.listHistory(WS);
    expect(summary?.title).toBe('private to workspace A');
    expect((await service.listHistory(otherWorkspace)).map(({ title }) => title)).toEqual([
      'private to workspace B',
    ]);
    await expect(service.readHistory(otherWorkspace, summary!.id)).resolves.toBeNull();
    const dir = join(dataDir, 'claude-history', WS);
    expect(readdirSync(dir)).toEqual([`${summary!.id}.jsonl`]);
    writeFileSync(join(dir, `${summary!.id}.jsonl`), '{"kind":"resume","id":"--x"}\n', {
      flag: 'a',
    });
    await expect(service.readHistory(WS, summary!.id)).resolves.toEqual({
      records: [{ kind: 'prompt', text: 'private to workspace A' }],
      resumable: false,
    });
    await expect(
      service.start(1, { id: ID, workspaceId: WS, historyId: summary!.id }, 'C:\\ws', publish),
    ).resolves.toBe('history-unavailable');
  });

  it('closes the sessions of a window that goes away', async () => {
    const { service, opened, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    await service.start(2, { id: OTHER, workspaceId: WS }, 'C:\\ws', publish);
    await service.closeOwner(1);
    expect(opened[0]?.close).toHaveBeenCalled();
    expect(opened[1]?.close).not.toHaveBeenCalled();
    expect(service.send(1, ID, 'hi', active)).toBe('closed');
    await service.closeAll();
    expect(opened[1]?.close).toHaveBeenCalled();
  });

  it('waits for an opening session to be closed during shutdown', async () => {
    let finishOpen!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishOpen = resolve;
    });
    const { service, opened, publish } = setup(undefined, gate);
    const start = service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    void service.closeOwner(1);
    const shutdownDone = vi.fn();
    const shutdown = service.closeAll().then(shutdownDone);
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdownDone).not.toHaveBeenCalled();
    finishOpen();
    await expect(start).resolves.toBe('failed');
    await shutdown;
    expect(opened[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('reports a session that cannot open', async () => {
    const { service, reports, publish } = setup();
    const failing = createClaudeService({
      dataDir: mkdtempSync(join(tmpdir(), 'cc-svc-')),
      report: (r) => reports.push(r),
      programs: async () => ({ claude: { command: 'claude.exe', args: [] } }),
      open: (async () => {
        throw new Error('pipe busy');
      }) as unknown as typeof openClaudeSession,
    });
    await expect(failing.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish)).resolves.toBe(
      'failed',
    );
    expect(reports).toEqual([
      expect.objectContaining({
        kind: 'claude-setup',
        message: expect.stringContaining('pipe busy'),
      }),
    ]);
    expect(service).toBeDefined();
  });
});
