import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  MAX_TERMINALS,
  TERMINAL_CHUNK_SIZE,
  type TerminalShell,
} from '@control-center/ipc-contract/terminal';
import { registerFileLinks } from './fileLinks';

export const SHELL_LABEL = { powershell: 'PowerShell', bash: 'Bash' } as const;

type TerminalStatus = 'starting' | 'running' | 'exited' | 'failed';

export interface OpenTerminal {
  id: string;
  workspaceId: string;
  shell: TerminalShell;
  status: TerminalStatus;
  notice: string;
  screen: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
}

export function useTerminals() {
  const sessions = useRef(new Map<string, OpenTerminal>());
  const [tabs, setTabs] = useState<OpenTerminal[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const refresh = () => setTabs([...sessions.current.values()]);

  useEffect(() => {
    const open = sessions.current;
    const unsubscribe = window.api.terminal.onUpdated((update) => {
      const terminal = open.get(update.id);
      if (!terminal) return;
      if (update.kind === 'output') {
        terminal.screen.write(update.data);
        return;
      }
      terminal.screen.options.disableStdin = true;
      terminal.status = 'exited';
      terminal.notice = 'Shell exited (' + update.exitCode + ').';
      refresh();
    });
    return () => {
      unsubscribe();
      for (const session of open.values()) {
        session.screen.dispose();
        void window.api.terminal.close({ id: session.id }).catch(() => undefined);
      }
      open.clear();
    };
  }, []);

  function select(tab: OpenTerminal): void {
    setSelected((previous) => ({ ...previous, [tab.workspaceId]: tab.id }));
  }

  function start(workspaceId: string, shell: TerminalShell): void {
    if (sessions.current.size >= MAX_TERMINALS) return;
    const id = crypto.randomUUID();
    const host = document.createElement('div');
    host.className = 'terminal-screen';
    const screen = new Terminal({
      cols: 80,
      rows: 24,
      disableStdin: true,
      scrollback: 10_000,
      allowTransparency: false,
      linkHandler: { activate: () => undefined },
    });
    const fit = new FitAddon();
    screen.loadAddon(fit);
    const tab: OpenTerminal = {
      id,
      workspaceId,
      shell,
      screen,
      fit,
      host,
      status: 'starting',
      notice: '',
    };

    function closeRemote(): void {
      void window.api.terminal.close({ id }).catch(() => undefined);
    }

    function fail(message: string): void {
      if (!sessions.current.has(id)) return;
      tab.status = 'failed';
      tab.notice = message;
      screen.options.disableStdin = true;
      refresh();
    }

    screen.attachCustomKeyEventHandler((event) => !event.defaultPrevented);
    screen.onResize(({ cols, rows }) => {
      if (tab.status === 'running') {
        void window.api.terminal.resize({ id, cols, rows }).catch(() => undefined);
      }
    });
    let input = Promise.resolve();
    screen.onData((data) => {
      input = input
        .then(async () => {
          for (
            let offset = 0;
            offset < data.length && tab.status === 'running';
            offset += TERMINAL_CHUNK_SIZE
          ) {
            const written = await window.api.terminal.write({
              id,
              data: data.slice(offset, offset + TERMINAL_CHUNK_SIZE),
            });
            if (!written) break;
          }
        })
        .catch(() => {
          fail('Could not send input. Close this tab and start a new shell.');
          closeRemote();
        });
    });
    registerFileLinks(screen, (path) => {
      void window.api.workspace.openFile({ workspaceId, path, source: 'terminal' }).then(
        (opened) => {
          if (!opened) {
            tab.notice = 'File unavailable in this workspace.';
            refresh();
          }
        },
        () => {
          tab.notice = 'Could not open the file.';
          refresh();
        },
      );
    });

    sessions.current.set(id, tab);
    select(tab);
    refresh();
    void window.api.terminal
      .start({ id, workspaceId, shell, cols: screen.cols, rows: screen.rows })
      .then(
        (result) => {
          if (!sessions.current.has(id)) {
            if (result === 'started') closeRemote();
            return;
          }
          if (result === 'started') {
            if (tab.status !== 'starting') return;
            tab.status = 'running';
            screen.options.disableStdin = false;
            void window.api.terminal
              .resize({ id, cols: screen.cols, rows: screen.rows })
              .catch(() => undefined);
            refresh();
          } else if (result === 'shell-unavailable') {
            fail(
              shell === 'bash'
                ? 'Git Bash was not found. Start PowerShell or install Git for Windows.'
                : 'Windows PowerShell was not found.',
            );
          } else if (result === 'limit') {
            fail('Close another terminal tab to start a new shell.');
          } else {
            fail('This workspace folder is unavailable.');
          }
        },
        () => fail('Could not start the shell. See Problems for details.'),
      );
  }

  function close(tab: OpenTerminal): void {
    sessions.current.delete(tab.id);
    tab.status = 'exited';
    tab.screen.dispose();
    void window.api.terminal.close({ id: tab.id }).catch(() => undefined);
    refresh();
  }

  return { tabs, selected, select, start, close };
}

export type Terminals = ReturnType<typeof useTerminals>;
