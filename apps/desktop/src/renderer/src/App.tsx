import { useEffect, useMemo, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import type { AppInfo } from '@control-center/ipc-contract';
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
import { nextThemePref } from './theme/theme';
import { useTheme } from './theme/ThemeProvider';
import { IconSprite } from './ui/icons';

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
  const [info, setInfo] = useState<InfoState>({ kind: 'loading' });
  const [route, go] = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [compactBar, setCompactBar] = useState(false);
  const errors = useErrorList();
  const theme = useTheme();
  const total = errors.groups.reduce((n, g) => n + g.count, 0);

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
    setPaletteOpen((v) => !v);
  };
  const toggleBottom = () => setBottomOpen((v) => !v);

  useShortcuts({
    'palette.open': togglePalette,
    'palette.open.always': togglePalette,
    'help.open': () => {
      setPaletteOpen(false);
      setHelpOpen(true);
    },
    ...Object.fromEntries(SECTIONS.map((s) => [`section.${s.id}`, () => go(s.id)])),
    'problems.toggle': toggleBottom,
    'dock.bottom.toggle': toggleBottom,
    'dock.right.toggle': () => setRightOpen((v) => !v),
    'activity.compact': () => setCompactBar((v) => !v),
  });

  const commands = useMemo<PaletteCommand[]>(
    () => [
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
        id: 'toggle-problems',
        label: 'Show or hide Problems',
        group: 'Layout',
        icon: 'alert',
        combo: shortcutFor('problems.toggle')?.combo,
        run: toggleBottom,
      },
      {
        id: 'toggle-right-dock',
        label: 'Show or hide the right dock',
        group: 'Layout',
        icon: 'dock-r',
        combo: shortcutFor('dock.right.toggle')?.combo,
        run: () => setRightOpen((v) => !v),
      },
      {
        id: 'toggle-activity-compact',
        label: 'Compact activity bar',
        group: 'Layout',
        icon: 'live',
        combo: shortcutFor('activity.compact')?.combo,
        run: () => setCompactBar((v) => !v),
      },
      {
        id: 'show-shortcuts',
        label: 'Show keyboard shortcuts',
        group: 'Help',
        icon: 'info',
        combo: shortcutFor('help.open')?.combo,
        run: () => setHelpOpen(true),
      },
    ],
    // `go` and the theme setters are stable; the commands do not depend on anything else.
    [],
  );

  const horizontal = useDefaultLayout({
    id: 'cc-layout-h',
    panelIds: rightOpen ? ['main', 'right'] : ['main'],
  });
  const vertical = useDefaultLayout({
    id: 'cc-layout-v',
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
      <ActivityBar current={route} compact={compactBar} errorCount={total} />
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
                  <main className="view">{view}</main>
                </ErrorBoundary>
              </Panel>
              {bottomOpen && (
                <>
                  <Separator className="sep sep-h" />
                  <Panel id="bottom" defaultSize="32%" minSize="10%">
                    <section className="dock-fill" aria-label="Problems">
                      <ErrorConsole groups={errors.groups} onChanged={errors.refresh} />
                    </section>
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
        problemsOpen={bottomOpen}
        onToggleProblems={toggleBottom}
        theme={theme.theme}
        density={theme.density}
        onCycleTheme={() => theme.setTheme(nextThemePref(theme.theme))}
      />
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
