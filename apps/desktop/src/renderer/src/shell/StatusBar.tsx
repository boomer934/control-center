import { Glyph, Icon } from '../ui/icons';
import type { Density, ThemePref } from '../theme/theme';
import type { WorkspaceDto } from '@control-center/ipc-contract/workspace';

interface StatusBarProps {
  errorCount: number;
  problemsOpen: boolean;
  onToggleProblems(): void;
  theme: ThemePref;
  density: Density;
  onCycleTheme(): void;
  workspace: WorkspaceDto | null;
  sessionOpen: boolean;
  waiting: boolean;
  onShowSession(): void;
}

/**
 * Status bar of the design system. Segments by priority, from the left: wait, problems, session…
 */
export function StatusBar({
  errorCount,
  problemsOpen,
  onToggleProblems,
  theme,
  density,
  onCycleTheme,
  workspace,
  sessionOpen,
  waiting,
  onShowSession,
}: StatusBarProps) {
  return (
    <footer className="status" data-testid="status-bar">
      {waiting && (
        <span className="s-waiting">
          <button type="button" className="status-btn" onClick={onShowSession}>
            <Glyph name="s-waiting" /> Permission needed
          </button>
        </span>
      )}
      {workspace && (
        <span className="status-workspace" title={workspace.root}>
          {workspace.name}
        </span>
      )}
      <span>{sessionOpen ? 'Claude session' : 'No session'}</span>
      <span className={errorCount > 0 ? 'err' : undefined}>
        <button
          type="button"
          className="status-btn"
          aria-expanded={problemsOpen}
          onClick={onToggleProblems}
          data-testid="status-errors"
        >
          <Glyph name="s-error" />
          <b data-testid="status-error-count">{errorCount}</b>
          <span>{errorCount === 1 ? 'problem' : 'problems'}</span>
        </button>
      </span>
      <span className="r">
        <button
          type="button"
          className="status-btn"
          onClick={onCycleTheme}
          data-testid="status-theme"
          title="Change theme (system, dark, light)"
        >
          <Icon name="sparkle" className="g" />
          theme <b data-testid="status-theme-value">{theme}</b>
        </button>
      </span>
      <span>
        density <b>{density}</b>
      </span>
    </footer>
  );
}
