import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../ui/icons';
import { Button, IconButton } from '../ui/primitives';
import { MAX_TERMINALS } from '@control-center/ipc-contract/terminal';
import { SHELL_LABEL, type OpenTerminal, type Terminals } from './useTerminals';

function TerminalView({ tab }: { tab: OpenTerminal }) {
  const mount = useRef<HTMLDivElement | null>(null);
  const { resolved, density } = useTheme();

  useEffect(() => {
    const target = mount.current;
    if (!target) return;
    target.append(tab.host);
    const { screen, host, fit } = tab;
    if (!screen.element) screen.open(host);
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const size = fit.proposeDimensions();
        if (size && target.clientWidth && target.clientHeight) {
          screen.resize(Math.min(size.cols, 500), Math.min(size.rows, 250));
        }
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(target);
    resize();
    screen.focus();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      if (host.parentElement === target) host.remove();
    };
  }, [tab]);

  useEffect(() => {
    // ThemeProvider updates the root data attributes before this animation frame.
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) => style.getPropertyValue(name).trim();
      tab.screen.options.theme = {
        background: token('--bg-0'),
        foreground: token('--fg-1'),
        cursor: token('--fg-1'),
        selectionBackground: token('--bg-3'),
        red: token('--st-error'),
        green: token('--st-running'),
        blue: token('--st-reading'),
      };
      tab.screen.options.fontFamily = token('--font-mono');
      tab.screen.options.fontSize = parseFloat(token('--fs-s'));
      const size = tab.fit.proposeDimensions();
      if (size) tab.screen.resize(Math.min(size.cols, 500), Math.min(size.rows, 250));
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, resolved, density]);

  return (
    <div className="terminal-body">
      {tab.status !== 'running' || tab.notice ? (
        <p
          className={
            tab.status === 'failed' ? 'terminal-note shell-error' : 'terminal-note shell-muted'
          }
          role="status"
        >
          {tab.status === 'starting' ? 'Starting ' + SHELL_LABEL[tab.shell] + '…' : tab.notice}
        </p>
      ) : null}
      <div className="terminal-mount" ref={mount} data-focus-scope="terminal" />
    </div>
  );
}

export function TerminalDock({
  workspaceId,
  terminals,
  chooseWorkspace,
}: {
  workspaceId?: string;
  terminals: Terminals;
  chooseWorkspace(): void;
}) {
  if (!workspaceId) {
    return (
      <div className="terminal-empty">
        <p className="shell-muted">Open a workspace to start a terminal.</p>
        <Button onClick={chooseWorkspace}>Switch workspace</Button>
      </div>
    );
  }

  const tabs = terminals.tabs.filter((tab) => tab.workspaceId === workspaceId);
  const active = tabs.find((tab) => tab.id === terminals.selected[workspaceId]) ?? tabs.at(-1);
  const full = terminals.tabs.length >= MAX_TERMINALS;
  return (
    <section className="terminal-dock" aria-label="Terminal">
      <div className="terminal-toolbar">
        <div className="terminal-tabs" aria-label="Terminal tabs" role="group">
          {tabs.map((tab, index) => {
            const title = SHELL_LABEL[tab.shell] + ' ' + (index + 1);
            return (
              <div className="terminal-tab" key={tab.id}>
                <Button
                  variant="ghost"
                  aria-pressed={tab === active}
                  onClick={() => terminals.select(tab)}
                >
                  <Icon name="term" />
                  {title}
                </Button>
                <IconButton label={'Close ' + title} onClick={() => terminals.close(tab)}>
                  <Icon name="x" />
                </IconButton>
              </div>
            );
          })}
        </div>
        <div className="terminal-actions">
          <Button disabled={full} onClick={() => terminals.start(workspaceId, 'powershell')}>
            <Icon name="plus" />
            PowerShell
          </Button>
          <Button disabled={full} onClick={() => terminals.start(workspaceId, 'bash')}>
            <Icon name="plus" />
            Bash
          </Button>
        </div>
      </div>
      {active ? (
        <TerminalView key={active.id} tab={active} />
      ) : (
        <p className="terminal-empty shell-muted">Start PowerShell or Bash in this workspace.</p>
      )}
    </section>
  );
}
