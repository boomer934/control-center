import { memo, useCallback, useId, useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import type { GitCheckpoint } from '@control-center/ipc-contract';
import { Glyph } from '../ui/icons';
import { Button } from '../ui/primitives';
import { elapsedTime, type Timeline, type TimelineMark } from './replay';
import type { Replay } from './useReplay';
import './timeline.css';

// The chart has a minimum track width. On that width, 5% fits a 24 px hit target.
const MARK_WIDTH = 0.05;
const GAP = 0.006;
const MARK_GLYPHS: Partial<Record<TimelineMark['tone'], string>> = {
  read: 's-reading',
  search: 'i-search',
  write: 's-writing',
  shell: 'i-term',
  mcp: 'i-mcp',
  web: 'i-ext',
  agent: 'i-branch',
  waiting: 's-waiting',
  error: 's-error',
};

function packLane(marks: TimelineMark[], start: number, end: number) {
  const tracks: number[] = [];
  const positions = marks.map((mark) => {
    const left = Math.min((mark.at - start) / (end - start), 1 - MARK_WIDTH);
    const right = Math.max(left + MARK_WIDTH, ((mark.end ?? mark.at) - start) / (end - start));
    const free = tracks.findIndex((occupiedUntil) => occupiedUntil <= left);
    const row = free < 0 ? tracks.length : free;
    tracks[row] = right + GAP;
    return { mark, left, right, row };
  });
  return { positions, rows: tracks.length };
}

const TimelineLanes = memo(function TimelineLanes({
  timeline,
  selectedId,
  reviewDisabled,
  choose,
  review,
}: {
  timeline: Timeline;
  selectedId?: string;
  reviewDisabled?: boolean;
  choose(mark: TimelineMark): void;
  review?(checkpoint: GitCheckpoint): void;
}) {
  const lanes = useMemo(
    () =>
      timeline.lanes.map((lane) => ({
        ...lane,
        ...packLane(lane.marks, timeline.start, timeline.end),
      })),
    [timeline],
  );
  return (
    <ul className="timeline-lanes" aria-label="Agent lanes">
      {lanes.map(({ id, name, parent, depth, positions, rows }) => (
        <li
          key={id}
          className="timeline-lane"
          style={
            { '--timeline-depth': Math.min(3, depth), '--timeline-rows': rows } as CSSProperties
          }
          data-parent={parent}
        >
          <span className="timeline-agent" title={name}>
            {name}
          </span>
          <div className="timeline-track" role="group" aria-label={`${name} events`}>
            {positions.map(({ mark, left, right, row }) => (
              <button
                type="button"
                className="timeline-event"
                key={mark.id}
                data-tone={mark.tone}
                aria-pressed={selectedId === mark.id}
                aria-label={mark.checkpoint && review ? 'Review Git checkpoint' : mark.label}
                title={
                  mark.checkpoint && reviewDisabled
                    ? 'Wait for the Claude turn to finish'
                    : `${elapsedTime(mark.at - timeline.start)} · ${mark.label}`
                }
                disabled={Boolean(mark.checkpoint && review && reviewDisabled)}
                style={
                  {
                    '--timeline-x': `${left * 100}%`,
                    '--timeline-w': `${(right - left) * 100}%`,
                    '--timeline-row': row,
                  } as CSSProperties
                }
                onClick={() => (mark.checkpoint && review ? review(mark.checkpoint) : choose(mark))}
              >
                <Glyph name={mark.glyph ?? MARK_GLYPHS[mark.tone] ?? 's-idle'} />
                <span className="timeline-event-label">{mark.label}</span>
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
});

export function SessionTimeline({
  replay,
  onHistory,
  onCheckpoint,
  reviewDisabled,
}: {
  replay: Replay;
  onHistory?(): void;
  onCheckpoint?(checkpoint: GitCheckpoint): void;
  reviewDisabled?: boolean;
}) {
  const scrubberId = useId();
  const { timeline, at, archived, playing, selected, seek, togglePlayback } = replay;
  const choose = useCallback((mark: TimelineMark) => seek(mark.at, mark), [seek]);
  const position = at ?? timeline?.end ?? 0;

  function step(event: KeyboardEvent<HTMLInputElement>) {
    if (!timeline) return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
      return;
    }
    if (event.key === 'End' && !archived) {
      event.preventDefault();
      seek();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    if (event.shiftKey) {
      seek(Math.min(timeline.end, Math.max(timeline.start, position + direction * 10_000)));
      return;
    }
    const stops = timeline.stops;
    const next =
      direction < 0 ? stops.findLast((t) => t < position) : stops.find((t) => t > position);
    seek(next ?? (direction < 0 ? timeline.start : timeline.end));
  }

  if (!timeline && !onHistory) return null;
  const elapsed = timeline && elapsedTime(position - timeline.start);
  const duration = timeline && elapsedTime(timeline.end - timeline.start);
  return (
    <section className="session-timeline" aria-label="Session timeline">
      <header className="timeline-header">
        <h2 className="dock-title">Timeline</h2>
        {timeline && (
          <>
            <span className="timeline-mode">
              {archived ? 'Replay · read-only' : at === undefined ? 'Live' : 'Replay'}
            </span>
            <Button onClick={togglePlayback}>{playing ? 'Pause' : 'Play'}</Button>
            {!archived && at !== undefined && <Button onClick={() => seek()}>Back to live</Button>}
          </>
        )}
        {onHistory && (
          <Button variant="ghost" className="timeline-history" onClick={onHistory}>
            History
          </Button>
        )}
      </header>
      {timeline ? (
        <>
          <div className="timeline-scrub">
            <label htmlFor={scrubberId} className="sr-only">
              Replay position
            </label>
            <input
              id={scrubberId}
              type="range"
              min={timeline.start}
              max={timeline.end}
              step={1}
              value={position}
              aria-valuetext={`${elapsed} of ${duration}`}
              onChange={(event) => seek(event.currentTarget.valueAsNumber)}
              onKeyDown={step}
            />
            <span className="timeline-time" aria-hidden="true">
              {elapsed} / {duration}
            </span>
          </div>
          {selected && <p className="timeline-selection">{selected.label}</p>}
          <div
            className="timeline-chart"
            style={
              {
                '--timeline-cursor': `${((position - timeline.start) / (timeline.end - timeline.start)) * 100}%`,
              } as CSSProperties
            }
          >
            <TimelineLanes
              timeline={timeline}
              selectedId={selected?.id}
              reviewDisabled={reviewDisabled}
              choose={choose}
              review={onCheckpoint}
            />
          </div>
        </>
      ) : (
        <p className="timeline-empty">No activity recorded yet.</p>
      )}
    </section>
  );
}
