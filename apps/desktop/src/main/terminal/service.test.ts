import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TERMINALS, TERMINAL_CHUNK_SIZE } from '@control-center/ipc-contract/terminal';
import type { WorkspaceRoot } from '../workspace/paths';
import { createTerminalService } from './service';

function createPty() {
  let receive: (data: string) => void = () => {};
  let exit: (event: { exitCode: number }) => void = () => {};
  return {
    emitData: (data: string) => receive(data),
    emitExit: (exitCode: number) => exit({ exitCode }),
    pty: {
      pid: 42,
      cols: 80,
      rows: 24,
      process: 'PowerShell',
      handleFlowControl: false,
      onData: (listener: typeof receive) => {
        receive = listener;
        return { dispose: vi.fn() };
      },
      onExit: (listener: typeof exit) => {
        exit = listener;
        return { dispose: vi.fn() };
      },
      clear: vi.fn(),
      resize: vi.fn(),
      write: vi.fn(),
      kill: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    },
  };
}

const cwd = 'C:\\Workspace' as WorkspaceRoot;
const request = {
  workspaceId: 'workspace',
  id: 'tab',
  cols: 80,
  rows: 24,
  shell: 'powershell',
} as const;
const shell = { file: 'C:\\Windows\\powershell.exe', args: ['-NoProfile'] };

afterEach(() => {
  vi.useRealTimers();
});

describe('terminal service', () => {
  it('writes only to the sender’s running terminal in the active workspace', () => {
    const { pty } = createPty();
    const start = vi.fn(() => pty);
    const service = createTerminalService(start);
    const active = (id: string) => id === 'workspace';
    expect(service.start(1, request, cwd, shell, vi.fn())).toBe('started');
    expect(start).toHaveBeenCalledWith(shell.file, shell.args, {
      cwd,
      cols: 80,
      rows: 24,
      useConpty: true,
    });
    expect(service.write(2, request.id, 'text', active)).toBe(false);
    expect(service.write(1, request.id, 'text', () => false)).toBe(false);
    expect(service.resize(2, request.id, { cols: 100, rows: 30 })).toBe(false);
    expect(service.close(2, request.id)).toBe(false);
    expect(service.write(1, request.id, 'text', active)).toBe(true);
    expect(pty.write).toHaveBeenCalledExactlyOnceWith('text');
    service.closeOwner(1);
    expect(pty.kill).toHaveBeenCalledOnce();
    expect(service.write(1, request.id, 'text', active)).toBe(false);
  });

  it('batches output in bounded chunks, pauses the source, and flushes data before exit', () => {
    vi.useFakeTimers();
    const { pty, emitData, emitExit } = createPty();
    const publish = vi.fn();
    const service = createTerminalService(() => pty);
    service.start(1, request, cwd, shell, publish);
    emitData('x'.repeat(TERMINAL_CHUNK_SIZE * 4) + 'tail');
    expect(pty.pause).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      kind: 'output',
      id: request.id,
      data: 'x'.repeat(TERMINAL_CHUNK_SIZE),
    });
    vi.advanceTimersByTime(48);
    expect(pty.resume).toHaveBeenCalledOnce();
    emitExit(3);
    expect(publish.mock.calls.slice(-2)).toEqual([
      [{ kind: 'output', id: request.id, data: 'tail' }],
      [{ kind: 'exit', id: request.id, exitCode: 3 }],
    ]);
    expect(service.close(1, request.id)).toBe(false);
  });

  it('bounds concurrent terminals and releases a slot on close', () => {
    const start = vi.fn(() => createPty().pty);
    const service = createTerminalService(start);
    for (let i = 0; i < MAX_TERMINALS; i++) {
      expect(service.start(1, { ...request, id: String(i) }, cwd, shell, vi.fn())).toBe('started');
    }
    expect(service.start(1, request, cwd, shell, vi.fn())).toBe('limit');
    expect(start).toHaveBeenCalledTimes(MAX_TERMINALS);
    expect(service.close(1, '0')).toBe(true);
    expect(service.start(1, request, cwd, shell, vi.fn())).toBe('started');
    service.closeOwner(1);
  });
});
