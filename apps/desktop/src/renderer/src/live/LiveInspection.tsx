import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { AgentEvent, ErrorOrigin } from '@control-center/event-schema';
import type { TerminalError } from '@control-center/ipc-contract/terminal';
import { Glyph } from '../ui/icons';
import { Button, Sigil } from '../ui/primitives';
import { fileNodeId, type ActivityView, type AgentPresence, type ResolveFile } from './activity';
import { indexInspection, markForNode, summarizeEvents } from './inspection';
import { MachineInventory } from './MachineInventory';
import { ProjectErrorActions } from './ProjectErrorActions';
import { elapsedTime, ReplayActivity, type ReplayRecord, type TimelineMark } from './replay';
import { resolveErrorPath } from './resolve';
import type { Replay } from './useReplay';
import './inspection.css';

export interface MapInspection {
  layoutRef: RefObject<HTMLDivElement | null>;
  selectedNode?: string;
  selectedAgent?: string;
  inspectNode(node: string, error?: boolean): void;
  inspectAgent(agent: string): void;
}

const number = new Intl.NumberFormat('en-US');
const noTerminalErrors: readonly TerminalError[] = [];
const stateLabel: Record<AgentPresence['state'], string> = {
  idle: 'Thinking',
  reading: 'Reading',
  writing: 'Writing',
  running: 'Running',
  waiting: 'Waiting for you',
  error: 'Failed',
  done: 'Done',
};

const ERROR_ORIGIN: Record<ErrorOrigin, string> = {
  terminal: 'Terminal',
  command: 'Agent command',
  docker: 'Docker',
  'dev-server': 'Dev server',
  test: 'Tests',
};

function eventCount(events: readonly { at: number }[], at: number) {
  let from = 0;
  let to = events.length;
  while (from < to) {
    const mid = Math.floor((from + to) / 2);
    if (events[mid]!.at <= at) from = mid + 1;
    else to = mid;
  }
  return from;
}

type InspectionEvent = AgentEvent | (TerminalError & { type: 'terminal.error' });

function eventFields(
  event: InspectionEvent,
  summary: ReturnType<typeof summarizeEvents>,
  errorPath: string | undefined,
) {
  const call =
    'toolUseId' in event && event.toolUseId ? summary.calls.get(event.toolUseId) : undefined;
  const path = errorPath ?? ('file' in event ? event.file?.path : call?.target);
  const error =
    event.type === 'error.detected' || event.type === 'terminal.error' ? event : undefined;
  const write = event.type === 'file.written' ? event : path ? summary.writes.get(path) : undefined;
  const diff =
    write && 'toolUseId' in event && write.toolUseId === event.toolUseId ? write.diff : undefined;
  return [
    [
      'Tool',
      event.type !== 'tool.called' && (call?.tool ?? ('tool' in event ? event.tool : undefined)),
    ],
    ['Error', error?.message],
    [
      'Target',
      event.type !== 'tool.called' &&
        path &&
        (error?.line ? `${path}:${error.line}${error.column ? `:${error.column}` : ''}` : path),
    ],
    ['Origin', error && `${ERROR_ORIGIN[error.origin]} · ${error.language}`],
    ['Changes', diff && `+${diff.add} / −${diff.del}`],
    ['Model', 'model' in event ? event.model : undefined],
    ['Task', event.type === 'agent.spawned' ? event.task : undefined],
    ['Detail', 'detail' in event ? event.detail : 'reason' in event ? event.reason : undefined],
    [
      'Duration',
      'durationMs' in event && event.durationMs !== undefined
        ? elapsedTime(Math.round(event.durationMs))
        : undefined,
    ],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function Inspector({
  mark,
  view,
  summary,
  start,
  workspaceId,
  errorPath,
  onDraft,
}: {
  mark?: TimelineMark;
  view: ActivityView;
  summary: ReturnType<typeof summarizeEvents>;
  start: number;
  workspaceId?: string | undefined;
  errorPath: string | undefined;
  onDraft?: ((text: string) => void) | undefined;
}) {
  const [json, setJson] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const raw = useRef<HTMLTextAreaElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  const event: InspectionEvent | undefined = mark?.terminalError
    ? { ...mark.terminalError, type: 'terminal.error' }
    : mark?.event;
  const agentId = mark?.event?.agentId;
  const agent = view.agents.find((item) => item.id === agentId);
  const error =
    event?.type === 'error.detected' || event?.type === 'terminal.error' ? event : undefined;

  function copy() {
    if (!raw.current) return;
    raw.current.select();
    // This trusted click uses Chromium's selection copy. The renderer still has no
    // async clipboard or clipboard-read permission.
    const copied = document.execCommand('copy');
    copyButton.current?.focus();
    setCopyStatus(copied ? 'Copied' : 'Press Ctrl+C in the JSON field');
  }

  return (
    <section
      className={error && workspaceId ? 'live-inspector inspection-with-error' : 'live-inspector'}
      aria-label="Event inspector"
    >
      <header className="inspection-header">
        <h2 className="dock-title">Inspector</h2>
        {event && (
          <div role="group" aria-label="Inspector view">
            <Button variant="ghost" aria-pressed={!json} onClick={() => setJson(false)}>
              Details
            </Button>
            <Button variant="ghost" aria-pressed={json} onClick={() => setJson(true)}>
              JSON
            </Button>
          </div>
        )}
      </header>
      {event && mark ? (
        json ? (
          <div className="inspection-json">
            <textarea
              ref={raw}
              readOnly
              aria-label="Event JSON"
              value={JSON.stringify(mark.terminalError ?? event, null, 2)}
            />
            <div className="inspection-copy">
              <Button ref={copyButton} onClick={copy}>
                Copy JSON
              </Button>
              <span role="status">{copyStatus}</span>
            </div>
          </div>
        ) : (
          <div className="inspection-detail">
            <h3>{mark.label}</h3>
            <p>
              {agentId ? (
                <>
                  {agent?.name ?? agentId} ·{' '}
                  <time dateTime={mark.event?.timestamp}>{elapsedTime(mark.at - start)}</time>
                </>
              ) : (
                <time dateTime={mark.terminalError?.at}>
                  {new Date(mark.at).toLocaleTimeString()}
                </time>
              )}
            </p>
            <dl>
              {eventFields(event, summary, errorPath).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {error && workspaceId && (
              <ProjectErrorActions
                key={errorPath}
                workspaceId={workspaceId}
                error={error}
                path={errorPath}
                onDraft={onDraft}
              />
            )}
          </div>
        )
      ) : (
        <p className="inspection-detail">Select an event, agent, or active map node.</p>
      )}
    </section>
  );
}

export function LiveInspection({
  records,
  replay,
  terminalErrors = noTerminalErrors,
  resolveFile,
  workspaceId,
  onDraft,
  pendingPermission,
  children,
}: {
  records: readonly ReplayRecord[];
  replay: Replay;
  terminalErrors?: readonly TerminalError[];
  resolveFile?: ResolveFile | undefined;
  workspaceId?: string | undefined;
  onDraft?: ((text: string) => void) | undefined;
  pendingPermission?: boolean;
  children(inspection: MapInspection): ReactNode;
}) {
  const { timeline, at, selected, select } = replay;
  const layoutRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => indexInspection(records, timeline), [records, timeline]);
  const projection = useMemo(() => new ReplayActivity(records, index.events), [records, index]);
  const [clock, setClock] = useState(Date.now);
  const time = at ?? Math.max(clock, index.events.at(-1)?.at ?? 0);
  const count = eventCount(index.events, time);
  const summary = useMemo(
    () => summarizeEvents(index.events.slice(0, count).map(({ event }) => event)),
    [index, count],
  );
  const view = projection.viewAt(time, {
    pendingPermission: at === undefined && pendingPermission,
  });
  const commands = summary.commands.filter((event) => {
    const agent = view.agents.find((item) => item.id === event.agentId);
    return (
      agent?.state !== 'waiting' || (agent.action && agent.action.toolUseId !== event.toolUseId)
    );
  });
  const active = view.agents.some((agent) => agent.alive);
  useEffect(() => {
    if (at !== undefined || !active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [at, active]);

  const current = selected && index.byId.get(selected.id);
  const selectedError = selected?.terminalError;
  const terminalPath =
    at === undefined && selectedError && resolveFile && terminalErrors.includes(selectedError)
      ? resolveErrorPath(selectedError, resolveFile)
      : undefined;
  const terminalMark =
    terminalPath !== undefined && selected?.nodeId === fileNodeId(terminalPath)
      ? selected
      : undefined;
  const mark = terminalMark ?? (current && current.at <= time ? current : undefined);
  const agentError = mark?.event?.type === 'error.detected' ? mark.event : undefined;
  const errorPath = terminalMark
    ? terminalPath
    : agentError && resolveFile && resolveErrorPath(agentError, resolveFile);
  const cutoff = at ?? Infinity;
  const inspectNode = useCallback(
    (node: string, preferError = false) => {
      select(
        markForNode(index.byNode.get(node), {
          node,
          cutoff,
          preferError,
          terminalErrors,
          resolveFile,
        }),
      );
    },
    [index, select, cutoff, terminalErrors, resolveFile],
  );
  const inspectAgent = useCallback(
    (id: string) => {
      select(
        timeline?.lanes
          .find((lane) => lane.id === id)
          ?.marks.findLast((item) => item.at <= cutoff && item.event),
      );
    },
    [select, cutoff, timeline],
  );
  const inspection = useMemo(
    () => ({
      layoutRef,
      selectedNode: mark?.nodeId,
      selectedAgent: mark?.event?.agentId,
      inspectNode,
      inspectAgent,
    }),
    [mark, inspectNode, inspectAgent],
  );
  const hasActivity = Boolean(timeline && index.events.length);

  return (
    <div className="live-inspection-stack">
      <div className="live-inspection-layout" ref={layoutRef}>
        {children(inspection)}
        {(hasActivity || terminalMark) && (
          <aside
            className={hasActivity ? 'live-inspection' : 'live-inspection inspection-only'}
            aria-label="Live activity"
          >
            <section className="live-agents" aria-label="Agents" hidden={!hasActivity}>
              <header className="inspection-header">
                <h2 className="dock-title">Agents</h2>
              </header>
              <div className="inspection-body">
                <ul className="inspection-agents">
                  {view.agents.map((agent) => {
                    const permission = summary.permissions.get(agent.id);
                    const failure = summary.failures.get(agent.id);
                    const usage = summary.usage.get(agent.id);
                    const status =
                      agent.label === 'delegating' ? 'Delegating' : stateLabel[agent.state];
                    const target = commands.some(
                      (event) => event.toolUseId === agent.action?.toolUseId,
                    )
                      ? undefined
                      : agent.action?.target;
                    const seconds =
                      agent.action && Math.floor(Math.max(0, time - agent.action.since) / 1000);
                    return (
                      <li key={agent.id}>
                        <button
                          type="button"
                          className="inspection-agent"
                          onClick={() => inspectAgent(agent.id)}
                          aria-pressed={mark?.event?.agentId === agent.id}
                        >
                          <Sigil code={agent.code} agent={agent.kind} />
                          <span>
                            <strong>{agent.name}</strong>
                            <span className={`inspection-state s-${agent.state}`}>
                              <Glyph name={`s-${agent.state}`} />
                              {status}
                              {seconds !== undefined && <span>· {seconds}s</span>}
                            </span>
                          </span>
                        </button>
                        {target && (
                          <p>
                            <code>{target}</code>
                          </p>
                        )}
                        {agent.state === 'waiting' && permission?.detail && (
                          <p>{permission.detail}</p>
                        )}
                        {failure && (
                          <p className="inspection-failure">
                            Last error · {failure.detail ?? failure.reason}
                          </p>
                        )}
                        {usage && view.agents.length > 1 && (
                          <p>{number.format(usage.total)} tokens</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {view.agents.length === 0 && <p>No activity at this time.</p>}
                <div className="sr-only" role="status">
                  {view.agents
                    .filter((agent) => agent.state === 'waiting' || agent.state === 'error')
                    .map((agent) => `${agent.name}: ${stateLabel[agent.state]}`)
                    .join('. ')}
                </div>
                <dl className="inspection-summary">
                  <div>
                    <dt>Files</dt>
                    <dd>
                      {summary.reads.size} read · {summary.writes.size} changed
                    </dd>
                  </div>
                  <div>
                    <dt>Local commands</dt>
                    <dd>
                      {commands.length > 0
                        ? commands.map((event) => event.target ?? event.tool).join(' · ')
                        : 'None running in this session'}
                    </dd>
                  </div>
                  <div>
                    <dt>Session usage</dt>
                    <dd>
                      {summary.usage.size
                        ? `${number.format(summary.total)} tokens · ${number.format(summary.cache)} cached`
                        : 'No token usage recorded'}
                    </dd>
                    {summary.usage.size > 0 && (
                      <dd>
                        {summary.local > 0
                          ? `${number.format(summary.local)} local tokens`
                          : 'No local tokens recorded'}
                      </dd>
                    )}
                    {summary.durationMs !== undefined && (
                      <dd>{elapsedTime(Math.round(summary.durationMs))} recorded</dd>
                    )}
                  </div>
                </dl>
              </div>
            </section>
            <Inspector
              key={mark?.id ?? 'none'}
              mark={mark}
              view={view}
              summary={summary}
              start={timeline?.start ?? 0}
              workspaceId={workspaceId}
              errorPath={errorPath}
              onDraft={replay.archived ? undefined : onDraft}
            />
          </aside>
        )}
      </div>
      {timeline && index.events.length > 0 && <MachineInventory />}
    </div>
  );
}
