import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import { clock, clockFine, isActive } from '../replay/state';
import type { Replay, ReplayOp } from '../replay/types';

const AGID = { claude: 'a-claude', sub: 'a-sub' } as const;
const L = 120; // lane label column
const MIN_W = 14;
const LABEL_MAX = 180;
/** Advance of the timeline mono text (--fs-xs, narrow). */
const CH = 6.6;
const base = (p: string) => p.split('/').pop() ?? p;

/** "npm test 2>&1 | tail -40" → "npm test": the command, without pipes and redirections. */
const shortCmd = (c: string) =>
  (c.split(/\s*(?:\||&&|;)\s*/)[0] ?? c).replace(/\s+\d?>&?\S*/g, '').trim();

interface EvLook {
  cls: string;
  lb: string;
  /** Label; when it does not fit, `head` is shortened and `tail` is always kept. */
  head: string;
  tail: string;
}
function look(op: ReplayOp, future: boolean): EvLook {
  if (future) return { cls: 'ev-done', lb: 'lb-fut', head: label(op), tail: '' };
  if (op.outcome === 'denied')
    return { cls: 'ev-wait', lb: 'lb-wait', head: 'waiting · ', tail: op.tool };
  if (op.outcome === 'error') {
    // the error carries its target and reason (rule from 1c: "schema.test.ts · 2 failing")
    const target = op.kind === 'shell' ? shortCmd(op.target ?? '') : base(op.target ?? op.tool);
    return { cls: 'ev-err', lb: 'lb-err', head: target, tail: ` · ${op.reason ?? 'failed'}` };
  }
  const cls = {
    read: 'ev-rd',
    search: 'ev-rd',
    write: 'ev-ed',
    shell: 'ev-sh',
    agent: 'ev-run',
    other: 'ev-sh',
  }[op.kind];
  const lb = {
    read: 'lb-rd',
    search: 'lb-rd',
    write: 'lb-ed',
    shell: '',
    agent: 'lb-run',
    other: '',
  }[op.kind];
  return { cls, lb, head: label(op), tail: '' };
}
function fit({ head, tail }: EvLook, max: number): string {
  if (head.length + tail.length <= max) return head + tail;
  const room = max - tail.length - 1;
  if (room < 1) return `${(head + tail).slice(0, Math.max(1, max - 1))}…`;
  return `${head.slice(0, room)}…${tail}`;
}
function label(op: ReplayOp): string {
  switch (op.kind) {
    case 'read':
      return base(op.target ?? 'Read');
    case 'search':
      return `${op.tool} ${op.target ?? ''}`;
    case 'write':
      return op.diff
        ? `${base(op.target ?? '')} +${op.diff.add} −${op.diff.del}`
        : base(op.target ?? '');
    case 'shell':
      return `$ ${op.target ?? ''}`;
    case 'agent':
      return op.target ?? 'Agent';
    default:
      return op.tool;
  }
}

export function Timeline({
  replay,
  t,
  onSeek,
}: {
  replay: Replay;
  t: number;
  onSeek: (t: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  const [lane, setLane] = useState(34);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width));
    ro.observe(el);
    setLane(
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lane')) || 34,
    );
    return () => ro.disconnect();
  }, []);

  const R = W - 24;
  const D = replay.duration;
  const x = (ms: number) => L + (ms / D) * (R - L);

  // lanes: one per agent; a lane widens by one row for each parallel call (events never overlap)
  const lanes = useMemo(() => {
    let y = 0;
    return replay.agents.map((agent) => {
      const ends: number[] = [];
      const mine = replay.ops.filter((o) => o.agent === agent.id);
      const px = (ms: number) => L + (ms / D) * (R - L);
      const evs = mine.map((op, i) => {
        const x0 = px(op.start);
        const real = Math.max(px(op.end), x0 + MIN_W);
        // Tool calls last ~100 ms: a capsule may grow to fit its label, but only into the free
        // time before the next call of the same agent, so no fake parallel rows appear.
        const next = mine.slice(i + 1).find((o) => o.start > op.start);
        const room = (next ? px(next.start) : R) - 4;
        const past = look(op, false);
        const want = x0 + Math.min(LABEL_MAX, (past.head + past.tail).length * CH + 16);
        const x1 = Math.max(real, Math.min(want, room));
        let row = ends.findIndex((e) => x0 > e + 2);
        if (row < 0) row = ends.push(x1) - 1;
        else ends[row] = x1;
        return { op, x0, x1, row };
      });
      const rows = Math.max(1, ends.length);
      const top = y;
      y += lane * (1 + (rows - 1) * 0.6);
      return { agent, evs, top, bottom: y };
    });
  }, [replay, D, R, lane]);
  const H = (lanes.at(-1)?.bottom ?? lane) + 22;
  const bottom = H - 22;

  const seekFrom = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ms = ((e.clientX - r.left - L) / (R - L)) * D;
    onSeek(Math.min(D, Math.max(0, ms)));
  };
  const starts = useMemo(
    () => [...new Set(replay.ops.map((o) => o.start))].sort((a, b) => a - b),
    [replay],
  );
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = {
      ArrowRight: () => starts.find((s) => s > t + 1) ?? D,
      ArrowLeft: () => [...starts].reverse().find((s) => s < t - 1) ?? 0,
      Home: () => 0,
      End: () => D,
    }[e.key];
    if (!step) return;
    e.preventDefault();
    onSeek(step());
  };

  const nx = x(t);
  return (
    <div className="tl" id="tl" ref={box}>
      <div className="tlh">
        <span>Timeline</span>
        <span>
          <b>{replay.name}</b>
        </span>
        <span className="ell prompt" title={replay.prompt}>
          {replay.prompt}
        </span>
        {replay.simulated.includes('wait') ? (
          <span className="sim">simulated wait · claude -p denies at once</span>
        ) : null}
        <span className="r">
          <b>{clockFine(t)}</b> / {clock(D)}
        </span>
      </div>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label="Session time"
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={Math.round(t)}
        aria-valuetext={clockFine(t)}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFrom(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e);
        }}
      >
        {lanes.map(({ agent, evs, top, bottom: b }) => (
          <g key={agent.id}>
            <g style={{ color: `var(--ag-${agent.kind})` }}>
              <use href={`#${AGID[agent.kind]}`} x={10} y={top + 8} width={12} height={12} />
              <text className="ln-name" x={28} y={top + 18}>
                {agent.name.length > 13 ? `${agent.name.slice(0, 12)}…` : agent.name}
              </text>
              <text className="ln-sig" x={28} y={top + 30}>
                {agent.code}
              </text>
            </g>
            {evs.map(({ op, x0, x1, row }) => {
              const ey = top + 7 + row * lane * 0.6;
              const future = op.start > t;
              const lk = look(op, future);
              const { cls, lb } = lk;
              const shown = fit(lk, Math.floor((x1 - x0 - 14) / CH));
              return (
                <g key={op.id} data-op={op.id} data-active={isActive(op, t) || undefined}>
                  <rect className={`ev ${cls}`} x={x0} y={ey} width={x1 - x0} height={16} rx={8}>
                    <title>{`${clockFine(op.start)} ${op.tool} ${op.target ?? ''}`}</title>
                  </rect>
                  {x1 - x0 > 30 ? (
                    <text className={lb} x={x0 + 7} y={ey + 12}>
                      {shown}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <line className="sep" x1={0} y1={b} x2={W} y2={b} />
          </g>
        ))}
        {replay.agents
          .filter((a) => a.parentOp)
          .map((a) => {
            const from = lanes.find((l) => l.evs.some((e) => e.op.id === a.parentOp));
            const to = lanes.find((l) => l.agent.id === a.id);
            if (!from || !to) return null;
            const fx = x(a.start);
            const fy = from.top + 23;
            const ty = to.top + 15;
            return (
              <g key={`fork:${a.id}`}>
                <path className="fork" d={`M${fx} ${fy} V${ty - 8} Q${fx} ${ty} ${fx + 8} ${ty}`} />
                <circle className="fork-dot" cx={fx} cy={fy} r={2.5} />
              </g>
            );
          })}
        <line className="ax" x1={L - 6} y1={0} x2={L - 6} y2={bottom} />
        <line className="now-l" x1={nx} y1={0} x2={nx} y2={bottom} />
        <rect className="now-f" x={nx - 30} y={bottom + 3} width={60} height={16} rx={8} />
        <text className="now-t" x={nx - 22} y={bottom + 15}>
          {clockFine(t)}
        </text>
      </svg>
    </div>
  );
}
