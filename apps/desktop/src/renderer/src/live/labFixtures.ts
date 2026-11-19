// The sanitized fixtures as AgentEvents, and the project they were recorded in, for the map lab
// and the map tests. Read through Vite (import.meta.glob), so they reach only the bundles that
// import this module: the lab of the development and E2E builds, and Vitest.
import { normalizeClaudeSession, type AgentEvent } from '@control-center/event-schema';
import {
  PROJECT_MODEL_VERSION,
  type ProjectFile,
  type ProjectSnapshot,
} from '@control-center/project-model/schema';

const RAW = import.meta.glob('../../../../../../packages/fixtures/sanitized/sessione-0*.jsonl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function fixture(name: string): AgentEvent[] {
  const read = (suffix: string) =>
    (Object.entries(RAW).find(([path]) => path.endsWith(`/${name}${suffix}`))?.[1] ?? '')
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
  return normalizeClaudeSession(read('.jsonl'), read('.hooks.jsonl'), { sessionId: name });
}

export const projectFile = (path: string, imports: string[] = []): ProjectFile => ({
  path,
  language: path.endsWith('.js') ? 'javascript' : null,
  size: 100,
  roles: [],
  indexed: true,
  imports,
  importDirs: [],
  externals: [],
});

/** The fixture-lab project the sessions were recorded in, plus a few files they never touched. */
export const FIXTURE_PROJECT: ProjectSnapshot = {
  version: PROJECT_MODEL_VERSION,
  revision: 1,
  status: 'ready',
  truncated: false,
  progress: { indexed: 12, parseable: 12 },
  files: [
    projectFile('NOTES.md'),
    projectFile('README.md'),
    projectFile('docs/api.md'),
    projectFile('docs/setup.md'),
    projectFile('package.json'),
    projectFile('prova-uno.txt'),
    projectFile('scripts/release.js'),
    projectFile('src/cart.js', ['src/format.js']),
    projectFile('src/format.js'),
    projectFile('src/index.js', ['src/cart.js', 'src/inventory.js']),
    projectFile('src/inventory.js', ['src/format.js']),
    projectFile('src/legacy/old-cart.js'),
    projectFile('test/cart.test.js', ['src/cart.js']),
    projectFile('test/format.test.js', ['src/format.js']),
  ],
};
