import { useEffect, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import type { AppInfo } from '@control-center/ipc-contract';
import type { WorkspaceState } from '@control-center/ipc-contract/workspace';
import { ErrorBoundary } from './errors/ErrorBoundary';
import { ErrorConsole } from './errors/ErrorConsole';
import { FaultProbe } from './errors/faults';
import { useErrorList } from './errors/useErrorList';
import { SECTIONS, shortcutFor, type SectionId } from './keys/registry';
import { useShortcuts } from './keys/useShortcuts';
import { CommandPalette, type PaletteCommand } from './palette/CommandPalette';
import { ShortcutHelp } from './palette/ShortcutHelp';
import { ComponentsPage } from './pages/ComponentsPage';
import { ActivityBar } from './shell/ActivityBar';
import { useRoute, type RouteId } from './shell/route';
import { StatusBar } from './shell/StatusBar';
import { useWorkspaceLayout } from './shell/workspaceLayout';
import { TerminalDock } from './terminal/TerminalDock';
import { useTerminals, type Terminals } from './terminal/useTerminals';
import { nextThemePref } from './theme/theme';
import { useTheme } from './theme/ThemeProvider';
import { Icon, IconSprite } from './ui/icons';
import { Button } from './ui/primitives';

type InfoState = { kind: 'loading' } | { kind: 'ready'; info: AppInfo } | { kind: 'error' };

const PHASE_OF: Partial<Record<SectionId, string>> = {
  infra: 'Phase 6',
  local: 'Phase 7',
  mcp: 'Phase 8',
  git: 'Phase 4b',
  tele: 'Phase 9',
  settings: 'a later phase',
};

function LiveView({ state }: { state: InfoState }) {
  return (
    <div className="view-body" data-focus-scope="live" data-testid="shell">
      <h1 className="shell-title">Control Center</h1>
      {state.kind === 'loading' && <p className="shell-muted">Starting…</p>}
      {state.kind === 'error' && (
        <p className="shell-error" role="alert">
          The main process did not answer.
        </p>
      )}
      {state.kind === 'ready' && (
        <dl className="shell-info" data-testid="app-info">
          <dt>Version</dt>
          <dd>{state.info.version}</dd>
          <dt>Electron</dt>
          <dd data-testid="electron-version">{state.info.electron}</dd>
          <dt>Chromium</dt>
          <dd>{state.info.chrome}</dd>
          <dt>Node</dt>
          <dd>{state.info.node}</dd>
        </dl>
      )}
      <FaultProbe />
    </div>
  );
}

function Placeholder({ route }: { route: Exclude<RouteId, 'live' | 'components'> }) {
  const label = SECTIONS.find((s) => s.id === route)?.label ?? route;
  return (
    <div className="view-body" data-testid={`view-${route}`}>
      <h1 className="shell-title">{label}</h1>
      <p className="shell-muted">Arrives in {PHASE_OF[route] ?? 'a later phase'}.</p>
    </div>
  );
}

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceState>({ active: null, recent: [] });
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const terminals = useTerminals();

  useEffect(() => {
    let alive = true;
    void window.api.workspace.getState().then(
      (state) => {
        if (alive) setWorkspaces(state);
      },
      () => {
        if (alive) setWorkspaceNotice('Could not load recent workspaces.');
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  function chooseFolder(): void {
    setWorkspaceNotice('');
    void window.api.workspace.chooseFolder().then(
      (state) => {
        if (state) setWorkspaces(state);
      },
      () => setWorkspaceNotice('Could not open the folder. Check that it is available.'),
    );
  }

  function selectWorkspace(id: string): void {
    setWorkspaceNotice('');
    void window.api.workspace.selectRecent({ id }).then(
      (state) => {
        if (state) setWorkspaces(state);
        else setWorkspaceNotice('This folder is unavailable. Use Open folder to select it again.');
      },
      () => setWorkspaceNotice('Could not switch workspaces.'),
    );
  }

  return (
    <AppShell
      key={workspaces.active?.id ?? 'no-workspace'}
      workspaces={workspaces}
      workspaceNotice={workspaceNotice}
      chooseFolder={chooseFolder}
      selectWorkspace={selectWorkspace}
      terminals={terminals}
    />
  );
}

function AppShell({
  workspaces,
  workspaceNotice,
  chooseFolder,
  selectWorkspace,
  terminals,
}: {
  workspaces: WorkspaceState;
  workspaceNotice: string;
  chooseFolder(): void;
  selectWorkspace(id: string): void;
  terminals: Terminals;
}) {
  const [info, setInfo] = useState<InfoState>({ kind: 'loading' });
  const workspaceId = workspaces.active?.id;
  const { layout, setLayout } = useWorkspaceLayout(workspaceId);
  const { bottomOpen, bottomDock, rightOpen, compactBar } = layout;
  const [route, go] = useRoute(workspaceId ? (layout.route ?? 'live') : undefined);
  const [palette, setPalette] = useState<'commands' | 'workspace' | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const errors = useErrorList();
  const theme = useTheme();
  const total = errors.groups.reduce((n, g) => n + g.count, 0);

  useEffect(() => {
    if (workspaceId) setLayout((previous) => ({ ...previous, route }));
  }, [route, setLayout, workspaceId]);

  useEffect(() => {
    let alive = true;
    window.api.app
      .getInfo()
      .then((i) => alive && setInfo({ kind: 'ready', info: i }))
      .catch(() => alive && setInfo({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, []);

  const togglePalette = () => {
    setHelpOpen(false);
    setPalette((mode) => (mode === 'commands' ? null : 'commands'));
  };
  const toggleWorkspaces = () => {
    setHelpOpen(false);
    setPalette((mode) => (mode === 'workspace' ? null : 'workspace'));
  };
  const openFolder = () => {
    setPalette(null);
    setHelpOpen(false);
    chooseFolder();
  };
  const toggleBottom = () => setLayout((value) => ({ ...value, bottomOpen: !value.bottomOpen }));
  const toggleRight = () => setLayout((value) => ({ ...value, rightOpen: !value.rightOpen }));
  const toggleCompact = () => setLayout((value) => ({ ...value, compactBar: !value.compactBar }));
  const showDock = (dock: 'problems' | 'terminal') =>
    setLayout((value) => ({ ...value, bottomOpen: true, bottomDock: dock }));
  const toggleProblems = () =>
    setLayout((value) => ({
      ...value,
      bottomOpen: value.bottomDock !== 'problems' || !value.bottomOpen,
      bottomDock: 'problems',
    }));

  useShortcuts({
    'palette.open': togglePalette,
    'palette.open.always': togglePalette,
    'workspace.switch': toggleWorkspaces,
    'workspace.open': openFolder,
    'terminal.open': () => showDock('terminal'),
    'help.open': () => {
      setPalette(null);
      setHelpOpen(true);
    },
    ...Object.fromEntries(SECTIONS.map((s) => [`section.${s.id}`, () => go(s.id)])),
    'problems.toggle': toggleProblems,
    'dock.bottom.toggle': toggleBottom,
    'dock.right.toggle': toggleRight,
    'activity.compact': toggleCompact,
  });

  const commands: PaletteCommand[] = [
    ...SECTIONS.map((s) => ({
      id: `go-${s.id}`,
      label: `Go to ${s.label}`,
      group: 'Navigation',
      icon: s.icon,
      combo: shortcutFor(`section.${s.id}`)?.combo,
      run: () => go(s.id),
    })),
    {
      id: 'go-components',
      label: 'Open the components page',
      group: 'Navigation',
      icon: 'code',
      run: () => go('components'),
    },
    ...(['system', 'dark', 'light'] as const).map((t) => ({
      id: `theme-${t}`,
      label: `Theme: ${t}`,
      group: 'Appearance',
      icon: 'sparkle',
      keywords: ['color', 'appearance'],
      run: () => theme.setTheme(t),
    })),
    ...(['compact', 'comfortable'] as const).map((d) => ({
      id: `density-${d}`,
      label: `Density: ${d}`,
      group: 'Appearance',
      icon: 'sparkle',
      run: () => theme.setDensity(d),
    })),
    {
      id: 'switch-workspace',
      label: 'Switch workspace',
      group: 'Workspace',
      icon: 'folder',
      combo: 'Ctrl+P',
      run: () => setPalette('workspace'),
    },
    {
      id: 'show-terminal',
      label: 'Show terminal',
      group: 'Layout',
      icon: 'term',
      combo: shortcutFor('terminal.open')?.combo,
      run: () => showDock('terminal'),
    },
    {
      id: 'toggle-problems',
      label: 'Show or hide Problems',
      group: 'Layout',
      icon: 'alert',
      combo: shortcutFor('problems.toggle')?.combo,
      run: toggleProblems,
    },
    {
      id: 'toggle-right-dock',
      label: 'Show or hide the right dock',
      group: 'Layout',
      icon: 'dock-r',
      combo: shortcutFor('dock.right.toggle')?.combo,
      run: toggleRight,
    },
    {
      id: 'toggle-activity-compact',
      label: 'Compact activity bar',
      group: 'Layout',
      icon: 'live',
      combo: shortcutFor('activity.compact')?.combo,
      run: toggleCompact,
    },
    {
      id: 'show-shortcuts',
      label: 'Show keyboard shortcuts',
      group: 'Help',
      icon: 'info',
      combo: shortcutFor('help.open')?.combo,
      run: () => setHelpOpen(true),
    },
  ];

  const browseFolder = {
    id: 'open-folder',
    label: 'Open folder…',
    group: 'Workspace',
    icon: 'folder',
    combo: 'Ctrl+O',
    run: openFolder,
  };
  const recentCommands: PaletteCommand[] = workspaces.recent.map((workspace) => ({
    id: workspace.id,
    label: workspace.name,
    detail: workspace.root,
    group: 'Recent',
    icon: 'folder',
    current: workspace.id === workspaceId,
    run: () => selectWorkspace(workspace.id),
  }));

  const layoutKey = workspaceId ? 'cc-layout-' + workspaceId : 'cc-layout';

  const horizontal = useDefaultLayout({
    id: layoutKey + '-h',
    panelIds: rightOpen ? ['main', 'right'] : ['main'],
  });
  const vertical = useDefaultLayout({
    id: layoutKey + '-v',
    panelIds: bottomOpen ? ['view', 'bottom'] : ['view'],
  });

  const view =
    route === 'live' ? (
      <LiveView state={info} />
    ) : route === 'components' ? (
      <ComponentsPage />
    ) : (
      <Placeholder route={route} />
    );

  return (
    <div className="frame">
      <IconSprite />
      <ActivityBar
        current={route}
        compact={compactBar}
        errorCount={total}
        workspace={workspaces.active}
        onChooseWorkspace={toggleWorkspaces}
      />
      <div className="work">
        <Group
          orientation="horizontal"
          id="cc-layout-h"
          defaultLayout={horizontal.defaultLayout}
          onLayoutChanged={horizontal.onLayoutChanged}
        >
          <Panel id="main" minSize="30%">
            <Group
              orientation="vertical"
              id="cc-layout-v"
              defaultLayout={vertical.defaultLayout}
              onLayoutChanged={vertical.onLayoutChanged}
            >
              <Panel id="view" minSize="20%">
                <ErrorBoundary>
                  <main className="view">
                    {workspaceNotice && (
                      <p className="workspace-notice shell-error" role="status">
                        {workspaceNotice}
                      </p>
                    )}
                    {view}
                  </main>
                </ErrorBoundary>
              </Panel>
              {bottomOpen && (
                <>
                  <Separator className="sep sep-h" />
                  <Panel id="bottom" defaultSize="32%" minSize="10%">
                    <div className="dock-fill bottom-dock">
                      <div className="bottom-dock-nav" role="group" aria-label="Bottom dock">
                        <Button
                          variant="ghost"
                          aria-pressed={bottomDock === 'terminal'}
                          onClick={() => showDock('terminal')}
                        >
                          <Icon name="term" />
                          Terminal
                        </Button>
                        <Button
                          variant="ghost"
                          aria-pressed={bottomDock === 'problems'}
                          onClick={() => showDock('problems')}
                        >
                          <Icon name="alert" />
                          Problems
                        </Button>
                      </div>
                      {bottomDock === 'terminal' ? (
                        <TerminalDock
                          workspaceId={workspaceId}
                          terminals={terminals}
                          chooseWorkspace={toggleWorkspaces}
                        />
                      ) : (
                        <section className="dock-fill" aria-label="Problems">
                          <ErrorConsole
                            groups={errors.groups}
                            onChanged={errors.refresh}
                            onOpenFile={
                              workspaceId
                                ? (path) =>
                                    window.api.workspace.openFile({
                                      workspaceId,
                                      path,
                                      source: 'problems',
                                    })
                                : undefined
                            }
                          />
                        </section>
                      )}
                    </div>
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {rightOpen && (
            <>
              <Separator className="sep sep-v" />
              <Panel id="right" defaultSize="26%" minSize="15%" maxSize="50%">
                <aside
                  className="dock-fill dock-side"
                  aria-label="Session"
                  data-testid="right-dock"
                >
                  <h2 className="dock-title">Session</h2>
                  <p className="shell-muted">
                    No session yet. The session dock arrives in Phase 4.
                  </p>
                </aside>
              </Panel>
            </>
          )}
        </Group>
      </div>
      <StatusBar
        errorCount={total}
        problemsOpen={bottomOpen && bottomDock === 'problems'}
        onToggleProblems={toggleProblems}
        workspace={workspaces.active}
        theme={theme.theme}
        density={theme.density}
        onCycleTheme={() => theme.setTheme(nextThemePref(theme.theme))}
      />
      <CommandPalette
        open={palette !== null}
        workspace={palette === 'workspace'}
        commands={
          palette === 'workspace' ? [...recentCommands, browseFolder] : [...commands, browseFolder]
        }
        onClose={() => setPalette(null)}
      />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
