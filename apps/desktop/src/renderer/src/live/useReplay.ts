import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTimeline, type ReplayRecord, type TimelineMark } from './replay';

export function useReplay(records: readonly ReplayRecord[], archived = false) {
  const timeline = useMemo(() => buildTimeline(records), [records]);
  const [position, setPosition] = useState<number>();
  const [selected, setSelected] = useState<TimelineMark>();
  const [playFrom, setPlayFrom] = useState<{ at: number; clock: number }>();
  const at = timeline && (position ?? (archived ? timeline.end : undefined));
  const end = timeline?.end;

  useEffect(() => {
    if (playFrom === undefined || end === undefined) return;
    let frame = 0;
    let painted = -Infinity;
    const tick = (now: number) => {
      const next = Math.min(end, playFrom.at + Math.round(Math.max(0, now - playFrom.clock)));
      if (now - painted >= 32 || next === end) {
        setPosition(next);
        painted = now;
      }
      if (next < end) frame = requestAnimationFrame(tick);
      else setPlayFrom(undefined);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playFrom, end]);

  const seek = useCallback((time?: number, mark?: TimelineMark) => {
    setPlayFrom(undefined);
    setPosition(time);
    setSelected(mark);
  }, []);

  function togglePlayback() {
    if (!timeline) return;
    if (playFrom !== undefined) {
      setPlayFrom(undefined);
    } else {
      const from = at === undefined || at === timeline.end ? timeline.start : at;
      seek(from);
      setPlayFrom({ at: from, clock: performance.now() });
    }
  }

  return {
    timeline,
    at,
    archived,
    selected,
    playing: playFrom !== undefined,
    seek,
    togglePlayback,
  };
}

export type Replay = ReturnType<typeof useReplay>;
