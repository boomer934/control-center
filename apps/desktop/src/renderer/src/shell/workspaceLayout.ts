import { useEffect, useState } from 'react';
import { type RouteId, parseRoute } from './route';

type Dock = 'terminal' | 'problems';

interface WorkspaceLayout {
  rightOpen: boolean;
  bottomOpen: boolean;
  bottomDock: Dock;
  compactBar: boolean;
  route?: RouteId;
}

function readLayout(key: string): WorkspaceLayout {
  const defaults: WorkspaceLayout = {
    rightOpen: true,
    bottomOpen: false,
    bottomDock: 'problems',
    compactBar: false,
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(key) ?? 'null',
    ) as Partial<WorkspaceLayout> | null;
    if (!saved) return defaults;
    return {
      rightOpen: typeof saved.rightOpen === 'boolean' ? saved.rightOpen : defaults.rightOpen,
      bottomOpen: saved.bottomOpen === true,
      bottomDock: saved.bottomDock === 'terminal' ? 'terminal' : 'problems',
      compactBar: saved.compactBar === true,
      route: typeof saved.route === 'string' ? parseRoute(saved.route) : undefined,
    };
  } catch {
    return defaults;
  }
}

/** The shell is keyed by workspace so dock sizes and preferences restore on switch. */
export function useWorkspaceLayout(workspaceId?: string) {
  const key = workspaceId ? 'cc-workspace-layout-' + workspaceId : 'cc-unattached-layout';
  const [layout, setLayout] = useState(() => readLayout(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      // The current layout still works if storage is unavailable.
    }
  }, [key, layout]);
  return { layout, setLayout };
}
