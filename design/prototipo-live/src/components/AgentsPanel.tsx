import type { AgentView, LiveView } from '../replay/state';
import type { Replay, ReplayOp } from '../replay/types';
import { Glyph, Sig, StateTag } from './Glyph';

function nowLine(op: ReplayOp) {
  const target = op.kind === 'agent' ? `${op.target ?? ''}` : (op.target ?? '');
  return (
    <>
      <span>{op.kind === 'agent' ? 'Delegated' : op.tool}</span>
      <b>{target}</b>
    </>
  );
}

function Card({ a }: { a: AgentView }) {
  return (
    <div className={`card s-${a.state} ag-${a.agent.kind}`} data-agent={a.agent.code}>
      <div className="h">
        <Sig code={a.agent.code} kind={a.agent.kind} />
        <span className="nm">{a.agent.name}</span>
        <StateTag state={a.state} label={a.label} />
      </div>
      {a.agent.task ? <div className="task">{a.agent.task}</div> : null}
      {a.op ? <div className="now">{nowLine(a.op)}</div> : null}
      <div className="now">
        <span>
          {a.calls} tool {a.calls === 1 ? 'call' : 'calls'}
        </span>
      </div>
      {a.state === 'running' ? <span className="prog" /> : null}
    </div>
  );
}

export function AgentsPanel({ replay, view }: { replay: Replay; view: LiveView }) {
  const ended = view.t >= replay.duration;
  return (
    <aside className="side" aria-label="Agents">
      <div className="tabs">
        <span aria-selected="true">
          Agents <span className="n">{view.agents.length}</span>
        </span>
      </div>
      <div className="list">
        {view.agents.map((a) => (
          <Card key={a.agent.id} a={a} />
        ))}
        {ended ? (
          <div className={`card result s-${replay.result.ok ? 'done' : 'error'}`}>
            <div className="h">
              <Glyph id={replay.result.ok ? 's-done' : 's-error'} />
              <span className="nm">
                {replay.result.ok ? 'Session completed' : 'Session blocked'}
              </span>
            </div>
            {replay.result.summary ? <div className="task">{replay.result.summary}</div> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
