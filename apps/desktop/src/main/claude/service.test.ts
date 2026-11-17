import { mkdtempSync, rmSync } from 'node:fs';
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
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'cc-svc-'));
  dirs.push(dataDir);
  const opened: Array<
    ClaudeSessionOptions & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
  > = [];
  const open = (async (options: ClaudeSessionOptions) => {
    const send = vi.fn(() => 'started' as const);
    const close = vi.fn(async () => {});
    opened.push({ ...options, send, close });
    return {
      id: options.sessionId ?? '',
      status: 'idle' as const,
      hooks: true,
      claudeSessionId: undefined,
      send,
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
  return { service, opened, updates, publish: (u: ClaudeUpdate) => updates.push(u), reports };
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
  });

  it('sends only while the session’s workspace is active', async () => {
    const { service, opened, publish } = setup();
    await service.start(1, { id: ID, workspaceId: WS }, 'C:\\ws', publish);
    expect(service.send(1, ID, 'hi', () => false)).toBe('workspace-unavailable');
    expect(opened[0]?.send).not.toHaveBeenCalled();
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
