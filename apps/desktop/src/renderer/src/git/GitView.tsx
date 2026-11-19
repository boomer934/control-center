import { useCallback, useEffect, useState } from 'react';
import type {
  GitCheckpoint,
  GitDiffTarget,
  GitError,
  GitPatch,
  GitStatus,
} from '@control-center/ipc-contract';
import { Icon } from '../ui/icons';
import { Button } from '../ui/primitives';
import './git.css';

const messages: Record<GitError, string> = {
  'workspace-unavailable': 'Open the workspace again to use Git.',
  'git-unavailable': 'Git was not found on PATH.',
  'not-repository': 'Open a Git repository root as your workspace.',
  unsupported: 'Git cannot perform this action for the current repository, index or file type.',
  busy: 'Wait for the current Git action or Claude turn to finish.',
  stale: 'Git state changed. Refresh and try again.',
  'too-large': 'This Git result is too large to display.',
  'nothing-staged': 'Stage changes before committing.',
  'hook-failed': 'Git refused the commit. Check the repository hooks in the terminal.',
  'signing-required': 'This repository requires signed commits. Commit from the terminal.',
  'restore-incomplete':
    'Restore stopped. The original files and staging area are saved under Before restore in Git.',
  failed: 'The Git action failed. Check the repository and try again.',
};

export function gitMessage(error: GitError): string {
  return messages[error];
}

export function Patch({ value, label }: { value: GitPatch; label: string }) {
  const lines = value.text.split('\n', 4001);
  return (
    <>
      {value.text ? (
        <pre aria-label={label} tabIndex={0}>
          {lines.length > 4000
            ? value.text
            : lines.map((line, index) => (
                <span
                  key={index}
                  className={
                    line.startsWith('+') && !line.startsWith('+++ ')
                      ? 'git-line-add'
                      : line.startsWith('-') && !line.startsWith('--- ')
                        ? 'git-line-del'
                        : undefined
                  }
                >
                  {line}
                  {index < lines.length - 1 ? '\n' : null}
                </span>
              ))}
        </pre>
      ) : (
        <p className="shell-muted">No changes.</p>
      )}
      {value.truncated && <p className="shell-muted">The end of this diff is omitted.</p>}
    </>
  );
}

type StatusValue = Extract<GitStatus, { ok: true }>['value'];
type Change = StatusValue['files'][number];
const statuses: Record<string, string> = {
  A: 'Added',
  D: 'Deleted',
  M: 'Modified',
  T: 'Type changed',
  U: 'Unmerged',
  '?': 'Untracked',
};

function ChangeList({
  rows,
  staged,
  disabled,
  target,
  select,
  stage,
}: {
  rows: Change[];
  staged: boolean;
  disabled: boolean;
  target?: GitDiffTarget;
  select(target: GitDiffTarget): void;
  stage(path: string, staged: boolean): void;
}) {
  return (
    <section className="git-group">
      <h2>
        {staged ? 'Staged' : 'Changes'} <span className="shell-muted">{rows.length}</span>
      </h2>
      {rows.length === 0 && (
        <p className="shell-muted">{staged ? 'Nothing staged.' : 'Working tree is clean.'}</p>
      )}
      <ul className="git-list">
        {rows.map(({ path, index, worktree }) => {
          const status = staged ? index : worktree;
          return (
            <li key={path}>
              <Button
                variant="ghost"
                className="git-item"
                aria-pressed={
                  target?.kind === 'file' && target.path === path && target.staged === staged
                }
                onClick={() => select({ kind: 'file', path, staged })}
              >
                <span className="git-code" aria-label={statuses[status] ?? status}>
                  {status}
                </span>
                <span title={path}>{path}</span>
              </Button>
              <Button
                disabled={disabled}
                onClick={() => stage(path, !staged)}
                aria-label={`${staged ? 'Unstage' : 'Stage'} ${path}`}
              >
                {staged ? 'Unstage' : 'Stage'}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function GitView({
  workspaceId,
  running,
  revision,
  onCheckpoint,
  onDraft,
}: {
  workspaceId?: string;
  running: boolean;
  revision: number;
  onCheckpoint(checkpoint: GitCheckpoint): void;
  onDraft?: () => void;
}) {
  const [status, setStatus] = useState<GitStatus>();
  const [target, setTarget] = useState<GitDiffTarget>();
  const [diff, setDiff] = useState<GitPatch>();
  const [diffError, setDiffError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    if (!workspaceId) return;
    let current = true;
    void window.api.git.status({ workspaceId }).then(
      (result) => {
        if (current) setStatus(result);
      },
      () => {
        if (current) setStatus({ ok: false, error: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, [workspaceId, reload, revision, running]);

  useEffect(() => {
    if (!workspaceId) return;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [workspaceId, refresh]);

  useEffect(() => {
    if (!workspaceId || !target) return;
    let current = true;
    void window.api.git.diff({ workspaceId, target }).then(
      (result) => {
        if (!current) return;
        setDiff(result.ok ? result.value : undefined);
        setDiffError(result.ok ? '' : gitMessage(result.error));
      },
      () => {
        if (!current) return;
        setDiff(undefined);
        setDiffError(gitMessage('failed'));
      },
    );
    return () => {
      current = false;
    };
  }, [workspaceId, target, reload, revision]);

  function select(selection: GitDiffTarget) {
    setDiff(undefined);
    setDiffError('');
    setTarget(selection);
  }

  async function mutate(
    action: () => ReturnType<typeof window.api.git.commit>,
    success: string,
    committed = false,
  ) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      if (result.ok) {
        if (committed) setMessage('');
        setTarget(undefined);
        setNotice(success);
      } else {
        setError(gitMessage(result.error));
      }
    } catch {
      setError(gitMessage('failed'));
    } finally {
      setPending(false);
      refresh();
    }
  }

  const value = status?.ok ? status.value : undefined;
  const staged = value?.files.filter((file) => file.index !== ' ' && file.index !== '?') ?? [];
  const changes = value?.files.filter((file) => file.worktree !== ' ') ?? [];
  const disabled = pending || running;

  return (
    <div className="view-body git-view" data-testid="view-git">
      <header className="git-header">
        <h1 className="shell-title">Git</h1>
        {value && (
          <span className="git-code">
            <Icon name="git" /> {value.branch ?? value.head?.slice(0, 10) ?? 'Unborn HEAD'}
          </span>
        )}
        {workspaceId && (
          <Button className="git-refresh" onClick={refresh} disabled={pending}>
            Refresh
          </Button>
        )}
      </header>
      {!workspaceId && <p className="shell-muted">Open a workspace to see its Git changes.</p>}
      {workspaceId && !status && <p role="status">Loading Git…</p>}
      {status && !status.ok && <p role="status">{gitMessage(status.error)}</p>}
      {value && workspaceId && (
        <div className="git-layout">
          <div className="git-sidebar">
            {value.omitted > 0 && (
              <p className="shell-muted" role="status">
                {value.omitted} {value.omitted === 1 ? 'file' : 'files'} not shown.
              </p>
            )}
            <ChangeList
              rows={changes}
              staged={false}
              disabled={disabled}
              target={target}
              select={select}
              stage={(path, staged) =>
                void mutate(
                  () => window.api.git.stage({ workspaceId, path, staged }),
                  `Staged ${path}.`,
                )
              }
            />
            <ChangeList
              rows={staged}
              staged
              disabled={disabled}
              target={target}
              select={select}
              stage={(path, staged) =>
                void mutate(
                  () => window.api.git.stage({ workspaceId, path, staged }),
                  `Unstaged ${path}.`,
                )
              }
            />
            <form
              className="git-group"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(
                  () => window.api.git.commit({ workspaceId, message }),
                  'Commit created.',
                  true,
                );
              }}
            >
              <label htmlFor="git-message">Commit message</label>
              <textarea
                className="field"
                id="git-message"
                rows={2}
                value={message}
                maxLength={4000}
                onChange={(event) => setMessage(event.currentTarget.value)}
              />
              <div className="git-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={disabled || !staged.length || !message.trim()}
                >
                  Commit staged
                </Button>
                {onDraft && (
                  <Button onClick={onDraft} disabled={disabled || !staged.length}>
                    Draft with Claude
                  </Button>
                )}
              </div>
              {pending && <p role="status">Updating Git…</p>}
              {notice && <p role="status">{notice}</p>}
              {error && (
                <p className="shell-error" role="alert">
                  {error}
                </p>
              )}
            </form>
            <section className="git-group">
              <h2>Recent commits</h2>
              {!value.commits.length && <p className="shell-muted">No commits yet.</p>}
              <ul className="git-list">
                {value.commits.map((commit) => (
                  <li key={commit.oid}>
                    <Button
                      variant="ghost"
                      className="git-item"
                      aria-pressed={target?.kind === 'commit' && target.oid === commit.oid}
                      title={commit.subject}
                      onClick={() => select({ kind: 'commit', oid: commit.oid })}
                    >
                      <code>{commit.oid.slice(0, 7)}</code>
                      <span>{commit.subject || 'Empty message'}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
            {value.recovery.length > 0 && (
              <section className="git-group">
                <h2>Before restore</h2>
                <ul className="git-list">
                  {value.recovery.map((checkpoint) => (
                    <li key={checkpoint.id}>
                      <Button disabled={disabled} onClick={() => onCheckpoint(checkpoint)}>
                        Review {new Date(checkpoint.at).toLocaleString()}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <section className="git-diff" aria-label="Git diff">
            <h2>{target?.kind === 'file' ? target.path : (target?.oid.slice(0, 10) ?? 'Diff')}</h2>
            {target?.kind === 'file' && (
              <p className="shell-muted">{target.staged ? 'Staged' : 'Working tree'}</p>
            )}
            {target ? (
              diffError ? (
                <p className="shell-error" role="alert">
                  {diffError}
                </p>
              ) : diff ? (
                <Patch value={diff} label="Diff content" />
              ) : (
                <p role="status">Loading diff…</p>
              )
            ) : (
              <p className="shell-muted">Select a file or commit to review its diff.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
