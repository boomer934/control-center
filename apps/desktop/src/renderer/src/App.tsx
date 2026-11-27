import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import type { AppInfo, GitCheckpoint } from '@control-center/ipc-contract';
import type { TerminalError } from '@control-center/ipc-contract/terminal';
import type { WorkspaceState } from '@control-center/ipc-contract/workspace';
import { SessionDock } from './chat/SessionDock';
import { useClaudeChat, type ClaudeChat } from './chat/useClaudeChat';
import { ErrorBoundary } from './errors/ErrorBoundary';
import { ErrorConsole } from './errors/ErrorConsole';
import { FaultProbe } from './errors/faults';
import { useErrorList } from './errors/useErrorList';
import { CheckpointDialog } from './git/CheckpointDialog';
import { GitView } from './git/GitView';
import { SECTIONS, shortcutFor, type SectionId } from './keys/registry';
import { LiveMap, type DiffPreview } from './live/LiveMap';
import { LiveInspection } from './live/LiveInspection';
import { SessionTimeline } from './live/SessionTimeline';
import { makeResolveFile } from './live/resolve';
import { useReplay } from './live/useReplay';
import { indexSnapshot } from './live/visible';
import { useShortcuts } from './keys/useShortcuts';
import { CommandPalette, type PaletteCommand } from './palette/CommandPalette';
import { ShortcutHelp } from './palette/ShortcutHelp';
import { describeProject, useProjectModel } from './project/useProjectModel';
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

// The literal condition (not MAP_LAB) lets Rollup drop the lab chunk, with the fixtures, from
// the production build.
const MapLab =
  __CC_E2E_FAULTS__ || import.meta.env.DEV ? lazy(() => import('./live/MapLab')) : null;

type InfoState = { kind: 'loading' } | { kind: 'ready'; info: AppInfo } | { kind: 'error' };

const PHASE_OF: Partial<Record<SectionId, string>> = {
  infra: 'Phase 6',
  local: 'Phase 7',
  mcp: 'Phase 8',
  tele: 'Phase 9',
  settings: 'a later phase',
};

const GIT_DIFF_MESSAGE: Partial<Record<string, string>> = {
  'not-repository': 'This workspace is not a Git repository.',
  'git-unavailable': 'Git was not found on PATH.',
  'too-large': 'The diff is too large to preview.',
  busy: 'Git is busy. Hover again in a moment.',
};

/** Diff preview of the map: uncommitted changes of the file, on disk first, then staged. */
async function loadFileDiff(workspaceId: string, path: string): Promise<DiffPreview> {
  for (const staged of [false, true]) {
    const result = await window.api.git.diff({
      workspaceId,
      target: { kind: 'file', path, staged },
    });
    if (result.ok && result.value.text.trim())
      return { ok: true, text: result.value.text, truncated: result.value.truncated };
    if (!result.ok && result.error !== 'stale')
      return { ok: false, message: GIT_DIFF_MESSAGE[result.error] ?? 'Diff unavailable.' };
  }
  return { ok: false, message: 'No uncommitted changes in this file.' };
}

function LiveView({
  state,
  workspaceId,
  chat,
  terminalErrors,
  onCheckpoint,
  onHistory,
  onErrorDraft,
  reviewDisabled,
  openGit,
}: {
  state: InfoState;
  workspaceId?: string;
  chat: ClaudeChat;
  /** Errors the workspace's terminals found (phase 5e). */
  terminalErrors: readonly TerminalError[];
  onCheckpoint(checkpoint: GitCheckpoint, readOnly: boolean): void;
  onHistory?(): void;
  onErrorDraft(text: string): void;
  reviewDisabled: boolean;
  openGit(): void;
}) {
  // Deltas re-render this view only, not the whole shell.
  const project = useProjectModel(workspaceId);
  const snapshot = project.kind === 'ready' ? project.snapshot : undefined;
  const mapIndex = useMemo(() => (snapshot ? indexSnapshot(snapshot) : undefined), [snapshot]);
  const resolveFile = useMemo(
    () => (mapIndex ? makeResolveFile(mapIndex.byPath) : undefined),
    [mapIndex],
  );
  const replay = useReplay(chat.records, Boolean(chat.historyId && !chat.id));
  const historical = replay.at !== undefined;
  const reviewCheckpoint = useCallback(
    (checkpoint: GitCheckpoint) => onCheckpoint(checkpoint, historical || replay.archived),
    [historical, onCheckpoint, replay.archived],
  );
  const loadDiff = useCallback(
    (path: string) => (workspaceId ? loadFileDiff(workspaceId, path) : Promise.reject(new Error())),
    [workspaceId],
  );
  const about = (
    <>
      {state.kind === 'loading' && <span className="lmap-about">Starting…</span>}
      {state.kind === 'error' && (
        <span className="lmap-about shell-error" role="alert">
          The main process did not answer.
        </span>
      )}
      {state.kind === 'ready' && (
        <dl className="lmap-about" data-testid="app-info">
          <dt className="sr-only">Project</dt>
          <dd data-testid="project-model" aria-live="polite">
            {describeProject(project)}
          </dd>
          <dt className="sr-only">Version</dt>
          <dd title={`Chromium ${state.info.chrome} · Node ${state.info.node}`}>
            v{state.info.version}
          </dd>
          <dt className="sr-only">Electron</dt>
          <dd data-testid="electron-version">{state.info.electron}</dd>
        </dl>
      )}
    </>
  );
  return (
    <div className="live-view" data-focus-scope="live" data-testid="shell">
      <h1 className="sr-only">Control Center</h1>
      <LiveInspection
        records={chat.records}
        replay={replay}
        terminalErrors={terminalErrors}
        resolveFile={resolveFile}
        workspaceId={workspaceId}
        onDraft={onErrorDraft}
        pendingPermission={chat.permissions.length > 0}
      >
        {(inspection) => (
          <div className="lmap-area">
            {mapIndex && resolveFile ? (
              <LiveMap
                index={mapIndex}
                resolveFile={resolveFile}
                records={chat.records}
                errors={terminalErrors}
                at={replay.at}
                historical={historical}
                pendingPermission={chat.permissions.length > 0}
                loadDiff={historical ? undefined : loadDiff}
                openDiff={historical ? undefined : openGit}
                inspection={inspection}
                aside={about}
              />
            ) : (
              <>
                <div className="tb lmap-tb">
                  <span className="tool">
                    <b>Live</b>
                  </span>
                  <span className="r">{about}</span>
                </div>
                <div className="map">
                  <div className="empty lmap-empty">
                    <Icon name={project.kind === 'idle' ? 'folder' : 'live'} className="g" />
                    <h2>
                      {project.kind === 'idle' ? 'No workspace open' : describeProject(project)}
                    </h2>
                    <p>
                      {project.kind === 'idle'
                        ? 'Open a folder to see its files and what the agents do to them.'
                        : 'The map appears as soon as the file list is read.'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </LiveInspection>
      <div className="live-timeline">
        <SessionTimeline
          replay={replay}
          onHistory={onHistory}
          onCheckpoint={reviewCheckpoint}
          reviewDisabled={reviewDisabled}
        />
      </div>
      <FaultProbe />
    </div>
  );
}

function Placeholder({ route }: { route: Exclude<RouteId, 'live' | 'components' | 'map-lab'> }) {
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
  const chat = useClaudeChat(workspaceId);
  const [checkpoint, setCheckpoint] = useState<{ value: GitCheckpoint; readOnly: boolean }>();
  const [gitRevision, setGitRevision] = useState(0);
  const [restoreNotice, setRestoreNotice] = useState('');
  const [permissionFocus, setPermissionFocus] = useState(0);
  const [draftFocus, setDraftFocus] = useState(false);
  const consumeDraftFocus = useCallback(() => setDraftFocus(false), []);
  const [showHistory, setShowHistory] = useState(false);
  const { layout, setLayout } = useWorkspaceLayout(workspaceId);
  const { bottomOpen, bottomDock, rightOpen, compactBar } = layout;
  const [route, go] = useRoute(workspaceId ? (layout.route ?? 'live') : undefined);
  const [palette, setPalette] = useState<'commands' | 'workspace' | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const errors = useErrorList();
  const theme = useTheme();
  const total = errors.groups.reduce((n, g) => n + g.count, 0);
  const reviewCheckpoint = useCallback(
    (value: GitCheckpoint, readOnly = false) => setCheckpoint({ value, readOnly }),
    [],
  );
  const openHistory = () => {
    setLayout((value) => ({ ...value, rightOpen: true }));
    setShowHistory(true);
  };

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
      <>
        <LiveView
          key={`${workspaceId ?? 'no-workspace'}:${chat.id ?? chat.historyId ?? 'new'}`}
          state={info}
          workspaceId={workspaceId}
          chat={chat}
          terminalErrors={terminals.errorsFor(workspaceId)}
          onCheckpoint={reviewCheckpoint}
          onHistory={workspaceId ? openHistory : undefined}
          onErrorDraft={(text) => {
            chat.setDraft(chat.draft.trim() ? `${chat.draft}\n\n${text}` : text);
            setShowHistory(false);
            setLayout((value) => ({ ...value, rightOpen: true }));
            setDraftFocus(true);
          }}
          reviewDisabled={chat.status === 'running' || chat.pending}
          openGit={() => go('git')}
        />
      </>
    ) : route === 'components' ? (
      <ComponentsPage />
    ) : route === 'map-lab' ? (
      MapLab && (
        <Suspense fallback={null}>
          <MapLab />
        </Suspense>
      )
    ) : route === 'git' ? (
      <GitView
        key={workspaceId}
        workspaceId={workspaceId}
        running={chat.status === 'running' || chat.pending}
        revision={gitRevision}
        onCheckpoint={reviewCheckpoint}
        onDraft={
          chat.draft.trim()
            ? undefined
            : () => {
                chat.setDraft(
                  'Read the staged Git diff and suggest a commit message for it. Only read the diff. Do not edit files, stage changes or commit.',
                );
                setLayout((value) => ({ ...value, rightOpen: true }));
              }
        }
      />
    ) : (
      <Placeholder route={route} />
    );

  return (
    <div className="frame">
      <IconSprite />
      {workspaceId && checkpoint && (
        <CheckpointDialog
          workspaceId={workspaceId}
          checkpoint={checkpoint.value}
          readOnly={checkpoint.readOnly}
          close={() => setCheckpoint(undefined)}
          restored={(changed) => {
            setCheckpoint(undefined);
            setGitRevision((revision) => revision + 1);
            setRestoreNotice(
              changed
                ? 'Checkpoint restored. Recovery is available in Git.'
                : 'Files already match the checkpoint.',
            );
          }}
        />
      )}
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
                    {(workspaceNotice || restoreNotice) && (
                      <p
                        className={
                          workspaceNotice ? 'workspace-notice shell-error' : 'workspace-notice'
                        }
                        role="status"
                      >
                        {workspaceNotice || restoreNotice}
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
                <SessionDock
                  key={workspaceId}
                  workspace={workspaceId}
                  chat={chat}
                  chooseWorkspace={toggleWorkspaces}
                  permissionFocus={permissionFocus}
                  draftFocus={draftFocus}
                  consumeDraftFocus={consumeDraftFocus}
                  showHistory={showHistory}
                  setShowHistory={setShowHistory}
                  onHistoryLoaded={() => go('live')}
                />
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
        sessionOpen={Boolean(chat.id)}
        waiting={chat.permissions.length > 0}
        onShowSession={() => {
          setLayout((value) => ({ ...value, rightOpen: true }));
          setPermissionFocus((value) => value + 1);
        }}
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
