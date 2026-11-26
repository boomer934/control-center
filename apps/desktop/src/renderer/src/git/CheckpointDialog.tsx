import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { GitCheckpoint, GitPreview } from '@control-center/ipc-contract';
import { Button } from '../ui/primitives';
import { gitMessage, Patch } from './GitView';

type Preview = Extract<GitPreview, { ok: true }>['value'];

export function CheckpointDialog({
  workspaceId,
  checkpoint,
  readOnly = false,
  close,
  restored,
}: {
  workspaceId: string;
  checkpoint: GitCheckpoint;
  readOnly?: boolean;
  close(): void;
  restored(changed: boolean): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const title = useId();
  const scope = useId();
  const [path, setPath] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      opener.current?.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void window.api.git.preview({ workspaceId, id: checkpoint.id, path: path || undefined }).then(
        (result) => {
          if (!active) return;
          setLoading(false);
          if (result.ok) {
            if (!path) setFiles(result.value.files);
            setPreview(result.value);
          } else setError(gitMessage(result.error));
        },
        () => {
          if (!active) return;
          setLoading(false);
          setError(gitMessage('failed'));
        },
      );
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [workspaceId, checkpoint.id, path, revision]);

  function preparePreview() {
    setLoading(true);
    setError('');
    setPreview(undefined);
  }

  function dismiss() {
    dialog.current?.close();
    opener.current?.focus();
    close();
  }

  async function apply() {
    if (readOnly || !preview || restoring) return;
    setRestoring(true);
    setError('');
    try {
      const result = await window.api.git.restore({ workspaceId, token: preview.token });
      if (result.ok) {
        dialog.current?.close();
        opener.current?.focus();
        restored(result.value !== null);
        return;
      }
      setPreview(undefined);
      setError(gitMessage(result.error));
    } catch {
      setPreview(undefined);
      setError(gitMessage('failed'));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="git-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!restoring) dismiss();
      }}
    >
      <header className="git-header">
        <h2 id={title}>{readOnly ? 'Compare Git checkpoint' : 'Restore Git checkpoint'}</h2>
        <time dateTime={checkpoint.at}>{new Date(checkpoint.at).toLocaleString()}</time>
      </header>
      <div className="git-dialog-body">
        <label htmlFor={scope}>{readOnly ? 'Files to compare' : 'Files to restore'}</label>
        <select
          id={scope}
          className="field"
          value={path}
          disabled={loading || restoring || !files.length}
          onChange={(event) => {
            preparePreview();
            setPath(event.currentTarget.value);
          }}
        >
          <option value="">All changed files</option>
          {files.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {loading && <p role="status">Comparing with current changes…</p>}
        {error && (
          <p className="shell-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            {preview.files.length === 0 ? (
              <p role="status">Already matches this checkpoint.</p>
            ) : (
              <div className="git-restore-preview">
                {!readOnly && (
                  <p>
                    {preview.files.length} {preview.files.length === 1 ? 'file will' : 'files will'}{' '}
                    change. A recovery checkpoint will save the current state.
                  </p>
                )}
                <h3>Working tree</h3>
                <Patch value={preview.worktree} label="Working tree comparison" />
                <h3>Staging area</h3>
                <Patch value={preview.index} label="Staging area comparison" />
              </div>
            )}
          </>
        )}
      </div>
      <footer className="git-actions">
        <Button autoFocus onClick={dismiss} disabled={restoring}>
          {preview?.files.length && !readOnly ? 'Cancel' : 'Close'}
        </Button>
        {error && (
          <Button
            onClick={() => {
              preparePreview();
              setRevision((value) => value + 1);
            }}
          >
            Refresh comparison
          </Button>
        )}
        {!readOnly && (
          <Button
            variant="danger"
            disabled={loading || restoring || !preview?.files.length}
            onClick={() => void apply()}
          >
            {restoring ? 'Restoring…' : path ? 'Restore file' : 'Restore all'}
          </Button>
        )}
      </footer>
    </dialog>
  );
}
