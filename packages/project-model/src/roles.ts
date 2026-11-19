// Roles by framework, as plugins. A plugin says whether it applies to the project (from the
// dependencies of its package.json files) and which roles a path has. Roles come from paths
// only: the model never reads a file to classify it. Adding a framework means adding a plugin.
import type { ProjectRole } from './schema.ts';

export interface RoleContext {
  /** Every dependency named in a package.json of the workspace. */
  dependencies: ReadonlySet<string>;
}

export interface RolePlugin {
  id: string;
  applies(context: RoleContext): boolean;
  roles(path: string): ProjectRole[];
}

const name = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const stem = (path: string) => name(path).replace(/\.[^.]+$/, '');
const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

const CONFIG_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'pyproject.toml',
  'setup.cfg',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'Dockerfile',
  'docker-compose.yml',
  'compose.yaml',
  '.env.example',
]);

/** Conventions shared by every stack: tests, configuration, schemas and entry points. */
export const commonRoles: RolePlugin = {
  id: 'common',
  applies: () => true,
  roles(path) {
    const roles: ProjectRole[] = [];
    const file = name(path);
    if (
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
      /^test_.*\.py$|_test\.py$/.test(file) ||
      file.endsWith('_test.go') ||
      /(?:^|\/)(?:__tests__|tests?)\//.test(path)
    )
      roles.push('test');
    if (
      CONFIG_FILES.has(file) ||
      /^tsconfig\..+\.json$/.test(file) ||
      /\.config\.[cm]?[jt]s$/.test(file) ||
      /^\.?eslintrc/.test(file)
    )
      roles.push('config');
    if (
      file.endsWith('.prisma') ||
      file.endsWith('.graphql') ||
      /(?:^|\/)migrations\/.+\.sql$/.test(path) ||
      file === 'schema.sql' ||
      file === 'models.py'
    )
      roles.push('schema');
    if (
      /^(?:src\/)?(?:main|index)\.[cm]?[jt]sx?$/.test(path) ||
      /^(?:src\/)?(?:main|__main__|app)\.py$/.test(path) ||
      /(?:^|\/)cmd\/[^/]+\/main\.go$/.test(path) ||
      path === 'main.go' ||
      /(?:^|\/)src\/(?:main|lib)\.rs$/.test(path)
    )
      roles.push('entry');
    return roles;
  },
};

/** Next.js: the app router (page, layout, route) and the pages router. */
export const nextRoles: RolePlugin = {
  id: 'nextjs',
  applies: ({ dependencies }) => dependencies.has('next'),
  roles(path) {
    if (!SCRIPT.test(path)) return [];
    // App router: page, layout or route files anywhere below an `app` folder.
    const parts = path.split('/');
    const app = /^(page|layout|route)\.[jt]sx?$/.exec(parts.at(-1)!);
    if (app && parts.slice(0, -1).includes('app')) {
      return [app[1] === 'route' ? 'api' : (app[1] as 'page' | 'layout')];
    }
    const pages = /(?:^|\/)(?:src\/)?pages\/(.+)$/.exec(path);
    if (pages) {
      if (pages[1]!.startsWith('api/')) return ['api'];
      return stem(path).startsWith('_') ? ['layout'] : ['page'];
    }
    return [];
  },
};

/** React: PascalCase .jsx/.tsx modules and anything in a components folder. */
export const reactRoles: RolePlugin = {
  id: 'react',
  applies: ({ dependencies }) => dependencies.has('react'),
  roles(path) {
    if (!/\.[jt]sx$/.test(path) && !/(?:^|\/)components\/.+\.[jt]sx?$/.test(path)) return [];
    if (/(?:^|\/)components\//.test(path) || /^[A-Z][A-Za-z0-9]*$/.test(stem(path))) {
      return /\.(?:test|spec|stories)\./.test(name(path)) ? [] : ['component'];
    }
    return [];
  },
};

/** Node API servers (Express and similar): route and controller folders. */
export const apiRoles: RolePlugin = {
  id: 'api-folders',
  applies: ({ dependencies }) =>
    ['express', 'fastify', 'koa', 'hono', '@nestjs/core'].some((dep) => dependencies.has(dep)),
  roles: (path) =>
    /(?:^|\/)(?:routes|controllers|api)\/.+\.[cm]?[jt]s$/.test(path) ? ['api'] : [],
};

export const ROLE_PLUGINS: readonly RolePlugin[] = [commonRoles, nextRoles, reactRoles, apiRoles];

export function rolesFor(path: string, plugins: readonly RolePlugin[]): ProjectRole[] {
  const roles = new Set<ProjectRole>();
  for (const plugin of plugins) for (const role of plugin.roles(path)) roles.add(role);
  return [...roles].sort();
}
