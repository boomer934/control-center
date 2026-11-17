// Phase 3a placeholder shell: proves the secure bridge works end to end. The real layout
// (panels, activity bar, status bar, palette) arrives in phase 3c.
import { useEffect, useState } from 'react';
import type { AppInfo } from '@control-center/ipc-contract';

type State = { kind: 'loading' } | { kind: 'ready'; info: AppInfo } | { kind: 'error' };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    window.api.app
      .getInfo()
      .then((info) => alive && setState({ kind: 'ready', info }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="shell" data-testid="shell">
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
    </main>
  );
}
