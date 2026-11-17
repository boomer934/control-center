import { useState } from 'react';
import type { ErrorGroupDto } from '@control-center/ipc-contract';

type Frame = ErrorGroupDto['frames'][number];

function frameText(f: Frame): string {
  const pos = f.line === null ? '' : `:${f.line}${f.column === null ? '' : `:${f.column}`}`;
  return `${f.file}${pos}`;
}

function Frames({ frames, onOpen }: { frames: Frame[]; onOpen?: (path: string) => void }) {
  const rest = frames.filter((f) => f.kind !== 'project').length;
  return (
    <ol className="errc-frames">
      {frames
        .filter((f) => f.kind === 'project')
        .map((f, i) => (
          <li key={i} className="errc-frame" data-testid="error-frame" data-kind={f.kind}>
            {f.fn && <span className="errc-fn">{f.fn}</span>}
            {onOpen ? (
              <button
                type="button"
                className="errc-file file-link"
                title="Open in editor"
                onClick={() => onOpen(f.file)}
              >
                {frameText(f)}
              </button>
            ) : (
              <span className="errc-file">{frameText(f)}</span>
            )}
          </li>
        ))}
      {rest > 0 && (
        <li className="errc-collapsed">
          <details>
            <summary>{rest} dependency and runtime frame(s)</summary>
            <ol className="errc-frames">
              {frames
                .filter((f) => f.kind !== 'project')
                .map((f, i) => (
                  <li key={i} className="errc-frame errc-frame-dim" data-kind={f.kind}>
                    {f.fn && <span className="errc-fn">{f.fn}</span>}
                    <span className="errc-file">{frameText(f)}</span>
                  </li>
                ))}
            </ol>
          </details>
        </li>
      )}
    </ol>
  );
}

export function ErrorConsole({
  groups,
  onChanged,
  onOpenFile,
}: {
  groups: ErrorGroupDto[];
  onChanged(): void;
  onOpenFile?(path: string): Promise<boolean>;
}) {
  const [notice, setNotice] = useState('');

  const copy = () => {
    window.api.errors
      .copyReport()
      .then((r) => setNotice(r.copied ? `Report of ${r.groups} group(s) copied` : 'Nothing copied'))
      .catch(() => setNotice('Could not copy the report'));
  };
  const clear = () => {
    window.api.errors
      .clear()
      .then(() => {
        setNotice('');
        onChanged();
      })
      .catch(() => setNotice('Could not clear the list'));
  };
  const open = (path: string) => {
    void onOpenFile?.(path).then(
      (opened) => setNotice(opened ? '' : 'File unavailable in this workspace.'),
      () => setNotice('Could not open the file.'),
    );
  };

  return (
    <section className="errc" aria-label="Errors Console" data-testid="error-console">
      <header className="errc-head">
        <h2 className="errc-title">Errors</h2>
        <span className="errc-notice" role="status" data-testid="error-notice">
          {notice}
        </span>
        <button type="button" className="errc-btn" onClick={copy} data-testid="error-copy">
          Copy report
        </button>
        <button type="button" className="errc-btn" onClick={clear} data-testid="error-clear">
          Clear
        </button>
      </header>
      {groups.length === 0 ? (
        <p className="shell-muted errc-empty">No errors.</p>
      ) : (
        <ul className="errc-list">
          {groups.map((g) => (
            <li
              key={g.id}
              className="errc-group"
              data-testid="error-group"
              data-origin={g.origin}
              data-kind={g.kind}
            >
              <div className="errc-row">
                <span className="errc-chip">{g.source}</span>
                <span className="errc-kind">{g.kind}</span>
                {g.count > 1 && (
                  <span className="errc-count" data-testid="error-count">
                    ×{g.count}
                  </span>
                )}
              </div>
              <p className="errc-message" data-testid="error-message">
                <strong>{g.name}</strong>
                {g.message ? `: ${g.message}` : ''}
              </p>
              {g.frames.length > 0 && <Frames frames={g.frames} onOpen={onOpenFile && open} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
