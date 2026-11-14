// Workspace-relative paths for AgentEvents. Events never carry an absolute path inside the
// workspace: it becomes a POSIX path relative to the workspace root. Paths outside the workspace
// are kept (they are useful: "the agent read a file outside the project") but flagged `external`
// and with the home directory masked as `~`.
import { z } from 'zod';
import { redactSecrets } from './redact';

const DRIVE = /^[A-Za-z]:\//;
const HOME = /^(?:[A-Za-z]:\/Users\/[^/]+|\/(?:home|Users)\/[^/]+)(?=\/|$)/i;

/** A POSIX path relative to the workspace root: no drive, no leading `/`, no `..`, no `~`. */
export const workspacePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.includes('\\'), 'use forward slashes')
  .refine((p) => !DRIVE.test(p) && !p.startsWith('/'), 'must be relative to the workspace')
  .refine((p) => !p.startsWith('~'), 'must be relative to the workspace')
  .refine((p) => !p.split('/').includes('..'), 'must not leave the workspace');

/** A file reference: a workspace path, or an external path with the home masked. */
export const fileRefSchema = z.union([
  z.strictObject({ path: workspacePathSchema, external: z.literal(false) }),
  z.strictObject({
    path: z
      .string()
      .min(1)
      .refine((p) => !HOME.test(p), 'the home directory must be masked as ~'),
    external: z.literal(true),
  }),
]);
export type FileRef = z.infer<typeof fileRefSchema>;

/** Resolves `.` and `..` segments of a `/`-separated path; returns null when it climbs above. */
function resolveSegments(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

const slashes = (p: string) => p.replace(/\\+/g, '/');
const isAbsolute = (p: string) => DRIVE.test(p) || p.startsWith('/');

/** Replaces the home directory prefix with `~`. */
export function maskHome(path: string): string {
  return slashes(path).replace(HOME, '~');
}

/**
 * Turns a path seen in a tool input or response into a FileRef. `cwd` is the workspace root as
 * recorded by the agent (any separator, any case on Windows).
 */
export function toFileRef(cwd: string, rawPath: string): FileRef {
  const p = slashes(rawPath.trim());
  const root = slashes(cwd).replace(/\/+$/, '');
  if (!isAbsolute(p)) {
    const rel = resolveSegments(p);
    if (rel !== null && rel !== '') return { path: rel, external: false };
    // climbs above the workspace (or is the root itself): resolve it against the root
    if (root && isAbsolute(root)) return toFileRef(cwd, `${root}/${p}`);
    return { path: p, external: true };
  }
  const windows = DRIVE.test(p);
  const norm = (windows ? '' : '/') + (resolveSegments(p) ?? '');
  const cmp = (s: string) => (windows ? s.toLowerCase() : s);
  if (root && (cmp(norm) === cmp(root) || cmp(norm).startsWith(`${cmp(root)}/`))) {
    const rel = norm.slice(root.length + 1);
    if (rel) return { path: rel, external: false };
  }
  return { path: maskHome(norm), external: true };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cleans free text (commands, messages, tool output) for an event: the workspace root becomes
 * `.`, any home directory becomes `~`, and secrets are redacted.
 */
export function makeTextCleaner(cwd: string): (text: string) => string {
  const root = slashes(cwd).replace(/\/+$/, '');
  const forms = root
    ? [...new Set([root, root.replace(/\//g, '\\'), root.replace(/\//g, '\\\\')])]
    : [];
  const rootRe = forms.length
    ? new RegExp(
        forms
          .sort((a, b) => b.length - a.length)
          .map(escapeRe)
          .join('|'),
        'gi',
      )
    : null;
  const homeRe =
    /[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)[^\\/\s"'`]+|\/(?:home|Users)\/[^/\s"'`]+/gi;
  return (text) => {
    let out = rootRe ? text.replace(rootRe, '.') : text;
    out = out.replace(homeRe, '~');
    return redactSecrets(out);
  };
}
