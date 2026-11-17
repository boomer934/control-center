import { spawn, type IPty } from 'node-pty';
import {
  MAX_TERMINALS,
  TERMINAL_CHUNK_SIZE,
  type TerminalSize,
  type TerminalStart,
  type TerminalUpdate,
} from '@control-center/ipc-contract/terminal';
import { coalesce } from '../ipc-events';
import type { WorkspaceRoot } from '../workspace/paths';

type Publish = (event: TerminalUpdate) => void;

interface TerminalSession {
  owner: number;
  workspaceId: string;
  pty: IPty;
  dispose(kill: boolean): void;
}

export function createTerminalService(startPty = spawn) {
  const sessions = new Map<string, TerminalSession>();

  function owned(owner: number | undefined, id: string): TerminalSession | undefined {
    const session = sessions.get(id);
    return session?.owner === owner ? session : undefined;
  }

  return {
    start(
      owner: number,
      request: TerminalStart,
      cwd: WorkspaceRoot,
      shell: { file: string; args: string[] },
      publish: Publish,
    ): 'started' | 'limit' {
      const { id, workspaceId, cols, rows } = request;
      if (sessions.has(id) || sessions.size >= MAX_TERMINALS) return 'limit';
      const pty = startPty(shell.file, shell.args, { cwd, cols, rows, useConpty: true });
      let pending = '';
      let paused = false;

      function sendChunk(): void {
        const data = pending.slice(0, TERMINAL_CHUNK_SIZE);
        pending = pending.slice(data.length);
        if (data) publish({ kind: 'output', id, data });
      }

      const batch = coalesce(16, () => {
        sendChunk();
        if (paused && pending.length < TERMINAL_CHUNK_SIZE) {
          paused = false;
          pty.resume();
        }
        if (pending) batch.trigger();
      });
      const dataListener = pty.onData((data) => {
        pending += data;
        if (!paused && pending.length >= TERMINAL_CHUNK_SIZE * 4) {
          paused = true;
          pty.pause();
        }
        batch.trigger();
      });
      const exitListener = pty.onExit(({ exitCode }) => {
        while (pending) sendChunk();
        dispose(false);
        publish({ kind: 'exit', id, exitCode });
      });

      function dispose(kill: boolean): void {
        sessions.delete(id);
        batch.cancel();
        dataListener.dispose();
        exitListener.dispose();
        if (kill) {
          // An exit can race a close. Keep disposing any other tabs owned by the window.
          try {
            if (paused) pty.resume();
            pty.kill();
          } catch {
            // ConPTY may already have closed the process handle.
          }
        }
      }

      sessions.set(id, { owner, workspaceId, pty, dispose });
      return 'started';
    },
    write(
      owner: number | undefined,
      id: string,
      data: string,
      isActive: (workspaceId: string) => boolean,
    ): boolean {
      const session = owned(owner, id);
      if (!session || !isActive(session.workspaceId)) return false;
      session.pty.write(data);
      return true;
    },
    resize(owner: number | undefined, id: string, size: TerminalSize): boolean {
      const session = owned(owner, id);
      if (!session) return false;
      session.pty.resize(size.cols, size.rows);
      return true;
    },
    close(owner: number | undefined, id: string): boolean {
      const session = owned(owner, id);
      session?.dispose(true);
      return Boolean(session);
    },
    closeOwner(owner: number): void {
      for (const session of sessions.values()) {
        if (session.owner === owner) session.dispose(true);
      }
    },
  };
}
