import { Icon } from '../ui/icons';
import { Badge } from '../ui/primitives';
import { SECTIONS, shortcutFor } from '../keys/registry';
import { hrefOf, type RouteId } from './route';

interface ActivityBarProps {
  current: RouteId;
  /** Icons only: the numbers on the badges disappear (never the bar itself). */
  compact: boolean;
  errorCount: number;
}

function titleOf(id: string, label: string): string {
  const combo = shortcutFor(`section.${id}`)?.combo;
  return combo ? `${label} (${combo})` : label;
}

export function ActivityBar({ current, compact, errorCount }: ActivityBarProps) {
  const main = SECTIONS.filter((s) => s.id !== 'settings');
  const settings = SECTIONS.find((s) => s.id === 'settings');
  return (
    <aside className="act" data-compact={compact || undefined} data-testid="activity-bar">
      <div className="ws none" title="No workspace">
        <span>+</span>
      </div>
      <nav aria-label="Sections">
        {main.map((s) => (
          <a
            key={s.id}
            href={hrefOf(s.id)}
            title={titleOf(s.id, s.label)}
            aria-label={s.label}
            aria-current={current === s.id ? 'page' : undefined}
          >
            <Icon name={s.icon} />
            {s.id === 'live' && errorCount > 0 && !compact && <Badge error>{errorCount}</Badge>}
          </a>
        ))}
      </nav>
      {settings && (
        <nav className="bottom" aria-label="Settings">
          <a
            href={hrefOf(settings.id)}
            title={titleOf(settings.id, settings.label)}
            aria-label={settings.label}
            aria-current={current === settings.id ? 'page' : undefined}
          >
            <Icon name={settings.icon} />
          </a>
        </nav>
      )}
    </aside>
  );
}
