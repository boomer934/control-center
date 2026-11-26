import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentEvent } from '@control-center/event-schema';
import { Glyph } from '../ui/icons';
import { Button, Sigil } from '../ui/primitives';
import type { ActivityView, AgentPresence } from './activity';
import { indexInspection, summarizeEvents } from './inspection';
import { elapsedTime, ReplayActivity, type ReplayRecord, type TimelineMark } from './replay';
import type { Replay } from './useReplay';
import './inspection.css';

export interface MapInspection {
  selectedNode?: string;
  selectedAgent?: string;
  inspectNode(node: string): void;
  inspectAgent(agent: string): void;
}

const number = new Intl.NumberFormat('en-US');
const stateLabel: Record<AgentPresence['state'], string> = {
  idle: 'Thinking',
  reading: 'Reading',
  writing: 'Writing',
  running: 'Running',
  waiting: 'Waiting for you',
  error: 'Failed',
  done: 'Done',
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

function eventFields(event: AgentEvent, summary: ReturnType<typeof summarizeEvents>) {
  const call =
    'toolUseId' in event && event.toolUseId ? summary.calls.get(event.toolUseId) : undefined;
  const path = 'file' in event ? event.file.path : call?.target;
  const write = event.type === 'file.written' ? event : path ? summary.writes.get(path) : undefined;
  const diff =
    write && 'toolUseId' in event && write.toolUseId === event.toolUseId ? write.diff : undefined;
  return [
    [
      'Tool',
      event.type !== 'tool.called' && (call?.tool ?? ('tool' in event ? event.tool : undefined)),
    ],
    ['Target', event.type !== 'tool.called' && path],
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
}: {
  mark?: TimelineMark;
  view: ActivityView;
  summary: ReturnType<typeof summarizeEvents>;
  start: number;
}) {
  const [json, setJson] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const raw = useRef<HTMLTextAreaElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  const event = mark?.event;
  const agent = view.agents.find((item) => item.id === event?.agentId);

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
    <section className="live-inspector" aria-label="Event inspector">
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
              value={JSON.stringify(event, null, 2)}
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
              {agent?.name ?? event.agentId} ·{' '}
              <time dateTime={event.timestamp}>{elapsedTime(mark.at - start)}</time>
            </p>
            <dl>
              {eventFields(event, summary).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
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
  pendingPermission,
  children,
}: {
  records: readonly ReplayRecord[];
  replay: Replay;
  pendingPermission?: boolean;
  children(inspection: MapInspection): ReactNode;
}) {
  const { timeline, at, selected, select } = replay;
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
  const mark = current && current.at <= time ? current : undefined;
  const cutoff = at ?? Infinity;
  const inspectNode = useCallback(
    (node: string) => {
      select(index.byNode.get(node)?.findLast((item) => item.at <= cutoff));
    },
    [index, select, cutoff],
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
      selectedNode: mark?.nodeId,
      selectedAgent: mark?.event?.agentId,
      inspectNode,
      inspectAgent,
    }),
    [mark, inspectNode, inspectAgent],
  );

  return (
    <div className="live-inspection-layout">
      {children(inspection)}
      {timeline && index.events.length > 0 && (
        <aside className="live-inspection" aria-label="Live activity">
          <section className="live-agents" aria-label="Agents">
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
            start={timeline.start}
          />
        </aside>
      )}
    </div>
  );
}
