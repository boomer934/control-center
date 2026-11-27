import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '@control-center/event-schema';
import {
  MAX_CLAUDE_MESSAGE_CHARS,
  type ClaudeHistoryRecord,
  type ClaudeHistorySummary,
  type ClaudePermission,
  type ClaudePermissionChoice,
} from '@control-center/ipc-contract/claude';
import { Button, StateTag } from '../ui/primitives';
import { MessageMarkdown as Text } from '../ui/MessageMarkdown';
import { claudeTurn, modelWarning } from './claudeConfig';
import type { ClaudeChat } from './useClaudeChat';
import './session.css';

const tokenCount = new Intl.NumberFormat('en-US');

function ClaudeConfiguration({ chat }: { chat: ClaudeChat }) {
  const turn = useMemo(() => claudeTurn(chat.records), [chat.records]);
  const modelSelect = useRef<HTMLSelectElement>(null);
  const focusModel = useRef(false);
  const { catalog } = chat;
  useLayoutEffect(() => {
    if (!catalog || !focusModel.current) return;
    focusModel.current = false;
    modelSelect.current?.focus();
  }, [catalog]);
  if (!catalog) {
    return (
      <Button
        variant="ghost"
        disabled={chat.pending}
        onClick={() => {
          focusModel.current = true;
          void chat.prepare();
        }}
      >
        Configure Claude
      </Button>
    );
  }

  const { current, defaults, models } = catalog;
  const selectedModel = models.find((model) => model.id === (current.model ?? defaults.model));
  const defaultModel = models.find((model) => model.id === defaults.model)?.label ?? defaults.model;
  const availableEfforts = selectedModel?.efforts ?? [...new Set(models.flatMap((m) => m.efforts))];
  const efforts =
    current.effort && !availableEfforts.includes(current.effort)
      ? [...availableEfforts, current.effort]
      : availableEfforts;
  const warning =
    !chat.dismissedModelWarning && !chat.muteModelWarnings && modelWarning(turn, catalog);
  const disabled = chat.status !== 'idle';
  const dismiss = (mute: boolean) => {
    modelSelect.current?.focus();
    chat.dismissModelWarning(mute);
  };

  return (
    <>
      <div className="session-config" role="group" aria-label="Next turn configuration">
        <label>
          Model
          <select
            ref={modelSelect}
            value={current.model ?? ''}
            disabled={disabled}
            aria-disabled={chat.pending || undefined}
            onChange={(event) => {
              if (chat.pending) return;
              const model = event.target.value || null;
              const next = models.find((item) => item.id === model);
              const effort = current.effort;
              void chat.configure({
                model,
                effort: next && effort && !next.efforts.includes(effort) ? null : effort,
              });
            }}
          >
            <option value="">CLI default{defaultModel && ` (${defaultModel})`}</option>
            {models.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effort
          <select
            value={current.effort ?? ''}
            disabled={disabled || !efforts.length}
            aria-disabled={chat.pending || undefined}
            onChange={(event) => {
              if (!chat.pending)
                void chat.configure({ model: current.model, effort: event.target.value || null });
            }}
          >
            <option value="">CLI default{defaults.effort && ` (${defaults.effort})`}</option>
            {efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={warning ? 'session-model-warning' : 'sr-only'}>
        <p role="status">
          {warning && (
            <>
              {warning.uncertain
                ? 'If the model changes, Claude will reread the conversation'
                : 'Claude will reread the conversation'}
              {warning.contextTokens === undefined
                ? '. Token estimate unavailable.'
                : ` (about ${tokenCount.format(warning.contextTokens)} input tokens).`}{' '}
              The next turn may take longer and cost more.
            </>
          )}
        </p>
        {warning && (
          <div className="session-actions">
            <Button variant="ghost" onClick={() => dismiss(false)}>
              Dismiss warning
            </Button>
            <Button variant="ghost" onClick={() => dismiss(true)}>
              Hide for this session
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

type ToolResult = Extract<AgentEvent, { type: 'tool.completed' | 'tool.failed' }>;

function groupTools(records: ClaudeHistoryRecord[]) {
  const results = new Map<string, ToolResult>();
  for (const record of records) {
    if (record.kind !== 'events') continue;
    for (const event of record.events) {
      if (event.type === 'tool.completed' || event.type === 'tool.failed')
        results.set(event.toolUseId, event);
    }
  }
  return results;
}

const Transcript = memo(function Transcript({ records }: { records: ClaudeHistoryRecord[] }) {
  const results = groupTools(records);
  return records.map((record, index) =>
    record.kind === 'prompt' ? (
      <article className="session-message session-prompt" key={index}>
        <h3>You</h3>
        <p>{record.text}</p>
      </article>
    ) : record.kind === 'checkpoint-warning' ? (
      <p className="shell-error" role="status" key={index}>
        Turn started without a Git checkpoint ({record.code}).
      </p>
    ) : record.kind === 'events' ? (
      record.events.map((event) => {
        const key = `${index}-${event.seq}`;
        if (event.type === 'message.assistant') {
          return (
            <article className="session-message" key={key}>
              <h3>{event.agentId === 'main' ? 'Claude' : 'Subagent'}</h3>
              <Text text={event.text} />
            </article>
          );
        }
        if (event.type === 'tool.called') {
          const result = results.get(event.toolUseId);
          return (
            <details className="session-tool" key={key}>
              <summary>
                <span>{event.tool}</span>{' '}
                <span className="shell-muted">
                  {result?.type === 'tool.failed' ? '· Failed' : result ? '· Done' : '· Running'}
                </span>
              </summary>
              {event.target && <pre>{event.target}</pre>}
              {result?.type === 'tool.failed' && (
                <p className="shell-muted">{result.detail ?? result.reason}</p>
              )}
            </details>
          );
        }
        if (event.type === 'session.ended' && !event.ok) {
          return (
            <p className="shell-muted" key={key}>
              {event.reason === 'interrupted'
                ? 'Turn stopped.'
                : (event.summary ?? 'The turn ended with an error. See Problems for details.')}
            </p>
          );
        }
        return null;
      })
    ) : null,
  );
});

function Permission({
  request,
  pending,
  respond,
}: {
  request: ClaudePermission;
  pending: boolean;
  respond(choice: ClaudePermissionChoice): void;
}) {
  return (
    <section className="session-permission" aria-labelledby={request.requestId}>
      <h3 id={request.requestId}>Allow {request.tool}?</h3>
      <pre id={`${request.requestId}-arguments`} tabIndex={0} aria-label="Tool arguments">
        {request.details}
      </pre>
      {request.truncated && (
        <p className="shell-muted">Approval includes the arguments omitted from this preview.</p>
      )}
      <div className="session-actions">
        <Button variant="primary" disabled={pending} onClick={() => respond('approve')}>
          Approve
        </Button>
        <Button disabled={pending} onClick={() => respond('deny')}>
          Deny
        </Button>
        {request.canRemember && (
          <Button
            disabled={pending}
            onClick={() => respond('session')}
            aria-describedby={`${request.requestId}-scope`}
          >
            Always in this session
          </Button>
        )}
      </div>
      {request.canRemember && (
        <p id={`${request.requestId}-scope`} className="shell-muted">
          Applies to this exact tool and arguments.
        </p>
      )}
    </section>
  );
}

export function SessionDock({
  chat,
  workspace,
  chooseWorkspace,
  permissionFocus,
  draftFocus,
  consumeDraftFocus,
  showHistory,
  setShowHistory,
  onHistoryLoaded,
}: {
  chat: ClaudeChat;
  workspace?: string;
  chooseWorkspace(): void;
  permissionFocus: number;
  draftFocus: boolean;
  consumeDraftFocus(): void;
  showHistory: boolean;
  setShowHistory(show: boolean): void;
  onHistoryLoaded(): void;
}) {
  const [history, setHistory] = useState<ClaudeHistorySummary[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const handledFocus = useRef(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const running = chat.status === 'running';
  const archived = Boolean(chat.historyId && !chat.id);
  const permission = chat.permissions[0];
  const { draft } = chat;
  const { listHistory } = chat;

  useLayoutEffect(() => {
    if (!showHistory && following.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [chat.records, chat.partial, chat.permissions, showHistory]);

  useLayoutEffect(() => {
    if (!permission || permissionFocus === handledFocus.current) return;
    handledFocus.current = permissionFocus;
    document.getElementById(`${permission.requestId}-arguments`)?.focus();
  }, [permission, permissionFocus]);

  useLayoutEffect(() => {
    if (!composer.current || !draft || !draftFocus) return;
    composer.current.focus();
    composer.current.setSelectionRange(draft.length, draft.length);
    consumeDraftFocus();
  }, [draft, draftFocus, consumeDraftFocus]);

  useEffect(() => {
    if (!showHistory) return;
    let current = true;
    setHistory(null);
    setHistoryError(false);
    void listHistory().then(
      (sessions) => {
        if (current) setHistory(sessions);
      },
      () => {
        if (current) setHistoryError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [listHistory, showHistory]);

  return (
    <aside
      className="dock-fill dock-side session-dock"
      aria-label="Session"
      data-testid="right-dock"
    >
      <header className="session-heading">
        <h2 className="dock-title">Session</h2>
        <div className="session-actions">
          {workspace && (
            <Button
              variant="ghost"
              aria-pressed={showHistory}
              disabled={chat.pending}
              onClick={() => setShowHistory(!showHistory)}
            >
              History
            </Button>
          )}
          {(chat.id || archived) && (
            <Button
              variant="ghost"
              disabled={running || chat.pending}
              onClick={() => {
                setShowHistory(false);
                following.current = true;
                void chat.newSession();
              }}
            >
              New chat
            </Button>
          )}
        </div>
      </header>
      <div className="sr-only" role="status">
        {permission
          ? `Permission needed for ${permission.tool}. ${chat.permissions.length} pending.`
          : running
            ? 'Claude is running.'
            : ''}
      </div>
      <div className="session-state" aria-hidden="true">
        {chat.permissions.length > 0 ? (
          <>
            <StateTag state="waiting" /> <span>{chat.permissions.length} pending</span>
          </>
        ) : running ? (
          <StateTag state="running" />
        ) : null}
      </div>
      {chat.error && (
        <p className="shell-error" role="alert">
          {chat.error}
        </p>
      )}
      {!workspace ? (
        <div className="session-empty">
          <p className="shell-muted">Choose a workspace to start a Claude session.</p>
          <Button onClick={chooseWorkspace}>Open workspace</Button>
        </div>
      ) : showHistory && chat.permissions.length === 0 ? (
        <section className="session-scroll" aria-label="Session history">
          {historyError ? (
            <p className="shell-error" role="alert">
              Could not load history. Reopen History to retry.
            </p>
          ) : history === null ? (
            <p className="shell-muted" role="status">
              Loading sessions…
            </p>
          ) : history.length === 0 ? (
            <p className="shell-muted">No saved sessions in this workspace.</p>
          ) : (
            <ul className="session-history">
              {history.map(({ id, title, updatedAt }) => (
                <li key={id}>
                  <Button
                    variant="ghost"
                    disabled={running || chat.pending}
                    onClick={async () => {
                      following.current = false;
                      if (await chat.loadHistory(id)) onHistoryLoaded();
                      setShowHistory(false);
                    }}
                  >
                    <span>{title || 'Claude session'}</span>
                    <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString()}</time>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div
          className="session-scroll"
          ref={scroll}
          onScroll={(event) => {
            const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
            following.current = scrollHeight - scrollTop - clientHeight <= 24;
          }}
          tabIndex={0}
          aria-label="Conversation"
        >
          {!chat.records.length && !running && (
            <p className="shell-muted">Send a message to start Claude in this workspace.</p>
          )}
          <Transcript records={chat.records} />
          {chat.partial && (
            <article className="session-message" data-testid="claude-streaming">
              <h3>Claude</h3>
              <p className="session-stream">{chat.partial}</p>
            </article>
          )}
        </div>
      )}
      {permission && (
        <Permission
          key={permission.requestId}
          request={permission}
          pending={chat.pending}
          respond={(choice) => void chat.respond(permission.requestId, choice)}
        />
      )}
      {workspace &&
        (archived ? (
          <div className="session-composer">
            {chat.resumable ? (
              <Button
                variant="primary"
                disabled={chat.pending}
                onClick={() => {
                  setShowHistory(false);
                  void chat.resume();
                }}
              >
                Resume session
              </Button>
            ) : (
              <p className="shell-muted">This session ended before Claude assigned it an ID.</p>
            )}
          </div>
        ) : (
          <form
            className="session-composer"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.trim() || running || chat.pending) return;
              following.current = true;
              setShowHistory(false);
              await chat.send(draft);
            }}
          >
            <ClaudeConfiguration chat={chat} />
            <label htmlFor="claude-prompt">Message Claude</label>
            <textarea
              ref={composer}
              id="claude-prompt"
              rows={2}
              value={draft}
              maxLength={MAX_CLAUDE_MESSAGE_CHARS}
              onChange={(event) => chat.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (event.ctrlKey || event.metaKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="session-actions">
              {running ? (
                <Button disabled={chat.pending} onClick={() => void chat.interrupt()}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={!draft.trim() || chat.pending}>
                  Send
                </Button>
              )}
            </div>
          </form>
        ))}
    </aside>
  );
}
