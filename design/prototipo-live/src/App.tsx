import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentsPanel } from './components/AgentsPanel';
import { Icon } from './components/Glyph';
import { LiveMap, useZoomPercent } from './components/LiveMap';
import { Timeline } from './components/Timeline';
import { layoutMap, type MapLayout } from './layout';
import { viewAt } from './replay/state';
import type { Replay } from './replay/types';

const params = new URLSearchParams(location.search);
const SPEEDS = [1, 2, 4] as const;

function useReducedMotion() {
  const q = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)'), []);
  const [v, setV] = useState(q.matches);
  useEffect(() => {
    const on = () => setV(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [q]);
  return v;
}

function FitTool() {
  const rf = useReactFlow();
  const zoom = useZoomPercent();
  return (
    <button
      className="tool"
      type="button"
      onClick={() => void rf.fitView({ padding: 0.06, maxZoom: 1 })}
    >
      <Icon id="fit" />
      Fit <span className="mono">{zoom}%</span>
    </button>
  );
}

function Live() {
  const reducedMotion = useReducedMotion();
  const [list, setList] = useState<string[] | null>(null);
  const [id, setId] = useState(params.get('fixture') ?? '');
  const [replay, setReplay] = useState<Replay | null>(null);
  const [layout, setLayout] = useState<MapLayout | null>(null);
  const [error, setError] = useState('');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(params.get('play') === '1');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark');

  useEffect(() => {
    fetch('/fixtures/index.json')
      .then((r) => r.json() as Promise<string[]>)
      .then((l) => {
        setList(l);
        setId((cur) => (cur && l.includes(cur) ? cur : l.includes('03') ? '03' : (l[0] ?? '')));
      })
      .catch(() => setList([]));
  }, []);

  const firstLoad = useRef(true);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setReady(false);
    fetch(`/fixtures/${id}.json`)
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? r.statusText);
        return r.json() as Promise<Replay>;
      })
      .then(async (rp) => {
        const row =
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 20;
        const lay = await layoutMap(rp, row);
        await document.fonts.ready;
        if (!live) return;
        setReplay(rp);
        setLayout(lay);
        setError('');
        // ?t=<ms>|end applies to the first load only (screenshot tests)
        const q = firstLoad.current ? params.get('t') : null;
        firstLoad.current = false;
        setT(
          q === 'end' ? rp.duration : q ? Math.min(rp.duration, Math.max(0, Number(q) || 0)) : 0,
        );
        setReady(true);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [id]);

  // playback: replay time advances with the wall clock times the speed
  useEffect(() => {
    if (!playing || !replay) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      setT((cur) => {
        const next = Math.min(replay.duration, cur + dt);
        if (next >= replay.duration) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, replay, speed]);

  const togglePlay = useCallback(() => {
    if (!replay) return;
    setPlaying((p) => {
      if (!p && t >= replay.duration) setT(0);
      return !p;
    });
  }, [replay, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const view = useMemo(() => (replay ? viewAt(replay, t) : null), [replay, t]);
  const readout = useMemo((): [string, string][] => {
    if (!replay || !view) return [];
    const changed = [...view.files.values()].filter((f) => f.diff).length;
    return [
      [`${view.past}/${replay.ops.length}`, 'tool calls'],
      [String(view.agents.filter((a) => a.alive).length), 'active agents'],
      [String(changed), changed === 1 ? 'file changed' : 'files changed'],
      [`${Math.round(replay.result.tokens / 1000)}k`, 'tokens'],
    ];
  }, [replay, view]);

  return (
    <div className="proto" data-ready={ready ? 'true' : 'false'}>
      <div className="tb" role="toolbar" aria-label="Replay controls">
        <span className="tool">
          <b>Live</b>
          <span>prototype · replay</span>
        </span>
        {(list ?? []).map((f) => (
          <button
            key={f}
            type="button"
            className="tool"
            aria-pressed={f === id}
            onClick={() => {
              setPlaying(false);
              setId(f);
            }}
          >
            {`sessione-${f}`}
          </button>
        ))}
        <button type="button" className="tool" onClick={togglePlay} disabled={!replay}>
          <Icon id={playing ? 'stop' : 'play'} />
          {playing ? 'Pause' : 'Play'}
          <span className="kbd">Space</span>
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="tool"
            aria-pressed={s === speed}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </button>
        ))}
        <span className="r">
          <button
            type="button"
            className="tool"
            onClick={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
          >
            Theme <b>{theme}</b>
          </button>
          <FitTool />
        </span>
      </div>
      <div className="body">
        <div className="col grow main">
          {error ? (
            <div className="banner s-error" role="alert">
              <span>
                <b>Cannot load the recording.</b> {error}. Record sessions as described in
                docs/memoria/FASE_1.md.
              </span>
            </div>
          ) : null}
          {list && list.length === 0 ? (
            <div className="map">
              <div className="empty placed">
                <h2>No recordings here</h2>
                <p>
                  The prototype replays the raw sessions in packages/fixtures/raw/, which are not in
                  git. Record one with scripts/fixtures (see docs/memoria/FASE_1.md).
                </p>
              </div>
            </div>
          ) : replay && layout && view ? (
            <>
              <LiveMap
                layout={layout}
                view={view}
                readout={readout}
                reducedMotion={reducedMotion}
              />
              <Timeline
                replay={replay}
                t={t}
                onSeek={(ms) => {
                  setPlaying(false);
                  setT(ms);
                }}
              />
            </>
          ) : (
            <div className="map">
              <div className="loading-note placed">
                <span className="prog run" />
                Loading recording…
              </div>
            </div>
          )}
        </div>
        {replay && view ? <AgentsPanel replay={replay} view={view} /> : null}
      </div>
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Live />
    </ReactFlowProvider>
  );
}
