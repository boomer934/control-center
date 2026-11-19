import { z } from 'zod';
import { WorkspaceIdSchema } from './workspace';

export const GitPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((name) => !name.includes('\0'));
export const GitOidSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
export const GitWorkspaceSchema = z.strictObject({ workspaceId: WorkspaceIdSchema });
export const GitFileSchema = GitWorkspaceSchema.extend({ path: GitPathSchema });
export const GitDiffRequestSchema = GitWorkspaceSchema.extend({
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('file'), path: GitPathSchema, staged: z.boolean() }),
    z.strictObject({ kind: z.literal('commit'), oid: GitOidSchema }),
  ]),
});
export const GitStageSchema = GitFileSchema.extend({ staged: z.boolean() });
export const GitCommitSchema = GitWorkspaceSchema.extend({
  message: z
    .string()
    .max(4000)
    .refine((value) => value.trim().length > 0 && !value.includes('\0')),
});

export const GitCheckpointSchema = z.strictObject({ id: z.uuid(), at: z.iso.datetime() });
export const GitCheckpointTargetSchema = GitWorkspaceSchema.extend({
  id: z.uuid(),
  path: GitPathSchema.optional(),
});
export const GitRestoreRequestSchema = GitWorkspaceSchema.extend({ token: z.uuid() });
export const GitErrorSchema = z.enum([
  'workspace-unavailable',
  'git-unavailable',
  'not-repository',
  'unsupported',
  'busy',
  'stale',
  'too-large',
  'nothing-staged',
  'hook-failed',
  'signing-required',
  'restore-incomplete',
  'failed',
]);
export type GitError = z.infer<typeof GitErrorSchema>;

const failure = z.strictObject({ ok: z.literal(false), error: GitErrorSchema });
function result<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true), value }), failure]);
}

export const GitStatusSchema = result(
  z.strictObject({
    branch: z.string().max(4096).nullable(),
    head: GitOidSchema.nullable(),
    files: z
      .array(
        z.strictObject({
          path: GitPathSchema,
          index: z.string().length(1),
          worktree: z.string().length(1),
        }),
      )
      .max(5000),
    omitted: z.number().int().nonnegative(),
    commits: z
      .array(
        z.strictObject({
          oid: GitOidSchema,
          subject: z.string().max(1000),
          at: z.iso.datetime({ offset: true }),
        }),
      )
      .max(30),
    recovery: z.array(GitCheckpointSchema).max(30),
  }),
);

export const GitPatchSchema = z.strictObject({
  text: z.string().max(250_000),
  truncated: z.boolean(),
});
export const GitDiffSchema = result(GitPatchSchema);
export const GitMutationSchema = result(z.null());
export const GitPreviewSchema = result(
  z.strictObject({
    token: z.uuid(),
    files: z.array(GitPathSchema).max(5000),
    worktree: GitPatchSchema,
    index: GitPatchSchema,
  }),
);
export const GitRestoreSchema = result(GitCheckpointSchema.nullable());

export type GitStatus = z.infer<typeof GitStatusSchema>;
export type GitPatch = z.infer<typeof GitPatchSchema>;
export type GitPreview = z.infer<typeof GitPreviewSchema>;
export type GitCheckpoint = z.infer<typeof GitCheckpointSchema>;
export type GitDiffTarget = z.infer<typeof GitDiffRequestSchema>['target'];
