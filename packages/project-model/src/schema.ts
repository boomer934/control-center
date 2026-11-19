// The project model contract (phase 5a, ADR 0012): what the Live view knows about the files of a
// workspace and how they import each other. The map (5b), the timeline (5c) and the inspector
// (5d) build on these shapes, so changes follow the same rule as AgentEvent: an incompatible
// change raises PROJECT_MODEL_VERSION.
//
// This module only depends on zod: the renderer and the IPC contract import it through
// `@control-center/project-model/schema` without pulling in the scanner or Tree-sitter.
import { z } from 'zod';

export const PROJECT_MODEL_VERSION = 1;

/** Beyond this many files the scan stops and the snapshot says `truncated`. */
export const MAX_PROJECT_FILES = 20_000;
/** Files larger than this are listed but not parsed for imports. */
export const MAX_PARSED_FILE_BYTES = 1024 * 1024;
export const MAX_IMPORTS_PER_FILE = 500;
export const MAX_EXTERNALS_PER_FILE = 200;
export const MAX_ROLES_PER_FILE = 8;
export const MAX_PROJECT_PATH = 1024;

/**
 * A path relative to the workspace root, with `/` separators: no leading `/`, no drive, no `.`
 * or `..` segment, no empty segment, no backslash and no control character.
 */
export const ProjectPathSchema = z
  .string()
  .min(1)
  .max(MAX_PROJECT_PATH)
  .refine(isProjectPath, { message: 'Invalid project path' });

export function isProjectPath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_PROJECT_PATH) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(value) || value.includes(':')) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export const PROJECT_LANGUAGES = [
  'typescript',
  'tsx',
  'javascript',
  'python',
  'go',
  'rust',
] as const;
export const ProjectLanguageSchema = z.enum(PROJECT_LANGUAGES);
export type ProjectLanguage = z.infer<typeof ProjectLanguageSchema>;

/**
 * What a file is for, from the role plugins (see roles.ts). A file can have several roles, or
 * none. New roles are a compatible change; renaming or removing one is not.
 */
export const PROJECT_ROLES = [
  'entry',
  'page',
  'layout',
  'api',
  'component',
  'schema',
  'test',
  'config',
] as const;
export const ProjectRoleSchema = z.enum(PROJECT_ROLES);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

/** A dependency name outside the workspace: an npm package, a Python module, a Go module… */
export const ExternalNameSchema = z
  .string()
  .min(1)
  .max(200)
  // eslint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u001f]/.test(value));

export const ProjectFileSchema = z.strictObject({
  path: ProjectPathSchema,
  /** Parsed language, or null for files the model lists without reading. */
  language: ProjectLanguageSchema.nullable(),
  size: z.number().int().nonnegative(),
  roles: z.array(ProjectRoleSchema).max(MAX_ROLES_PER_FILE),
  /** False until the file has been parsed (or when it cannot be). */
  indexed: z.boolean(),
  /** Workspace files this file imports. */
  imports: z.array(ProjectPathSchema).max(MAX_IMPORTS_PER_FILE),
  /** Workspace directories imported as a whole (Go packages). The empty string is the root. */
  importDirs: z.array(z.union([ProjectPathSchema, z.literal('')])).max(MAX_IMPORTS_PER_FILE),
  /** Imports that do not resolve inside the workspace, by package or module name. */
  externals: z.array(ExternalNameSchema).max(MAX_EXTERNALS_PER_FILE),
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

/**
 * `scanning`: the file list is being read. `indexing`: the list is known and imports are being
 * parsed. `ready`: every parseable file is indexed and the watcher keeps the model current.
 */
export const ProjectStatusSchema = z.enum(['scanning', 'indexing', 'ready']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectProgressSchema = z.strictObject({
  indexed: z.number().int().nonnegative(),
  parseable: z.number().int().nonnegative(),
});

export const ProjectSnapshotSchema = z.strictObject({
  version: z.literal(PROJECT_MODEL_VERSION),
  /** Grows by one with every delta. */
  revision: z.number().int().nonnegative(),
  status: ProjectStatusSchema,
  truncated: z.boolean(),
  progress: ProjectProgressSchema,
  files: z.array(ProjectFileSchema).max(MAX_PROJECT_FILES),
});
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

/**
 * A change on top of `revision - 1`: `upsert` replaces whole file entries (also when only their
 * imports changed), `remove` drops paths. A receiver that is not at `revision - 1` asks for a
 * new snapshot instead of applying it.
 */
export const ProjectDeltaSchema = z.strictObject({
  revision: z.number().int().positive(),
  status: ProjectStatusSchema,
  truncated: z.boolean(),
  progress: ProjectProgressSchema,
  upsert: z.array(ProjectFileSchema).max(MAX_PROJECT_FILES),
  remove: z.array(ProjectPathSchema).max(MAX_PROJECT_FILES),
});
export type ProjectDelta = z.infer<typeof ProjectDeltaSchema>;

/** Applies a delta to a snapshot. Returns null when the delta does not follow the snapshot. */
export function applyProjectDelta(
  snapshot: ProjectSnapshot,
  delta: ProjectDelta,
): ProjectSnapshot | null {
  if (delta.revision !== snapshot.revision + 1) return null;
  const files = new Map(snapshot.files.map((file) => [file.path, file]));
  for (const path of delta.remove) files.delete(path);
  for (const file of delta.upsert) files.set(file.path, file);
  return {
    version: snapshot.version,
    revision: delta.revision,
    status: delta.status,
    truncated: delta.truncated,
    progress: delta.progress,
    files: [...files.values()].sort((a, b) => compareProjectPaths(a.path, b.path)),
  };
}

/** Stable order for file lists: by code unit, like `git ls-files`. */
export function compareProjectPaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
