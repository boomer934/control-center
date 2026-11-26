import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorDraft } from '@control-center/event-schema';
import {
  createTerminalErrorScanner,
  MAX_ERRORS_PER_MINUTE,
  MAX_WAIT_MS,
  REPEAT_WINDOW_MS,
  SCAN_DELAY_MS,
} from './errors';

const CWD = 'C:\\dev\\shop';
const trace = (file = 'price', line = 2) =>
  `TypeError: boom in ${file}\r\n    at total (C:\\dev\\shop\\src\\${file}.js:${line}:21)\r\n`;

describe('terminal error scanner', () => {
  let found: { errors: ErrorDraft[]; at: Date }[];
  const scanner = () => createTerminalErrorScanner(CWD, (errors, at) => found.push({ errors, at }));

  beforeEach(() => {
    found = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('scans once the output pauses, even when a trace arrives in pieces', () => {
    const s = scanner();
    const text = trace();
    s.push(text.slice(0, 20));
    vi.advanceTimersByTime(SCAN_DELAY_MS - 50);
    s.push(text.slice(20));
    expect(found).toHaveLength(0);
    vi.advanceTimersByTime(SCAN_DELAY_MS);
    expect(found).toHaveLength(1);
    expect(found[0]!.errors[0]).toMatchObject({
      origin: 'terminal',
      file: { path: 'src/price.js', external: false },
      line: 2,
    });
  });

  it('scans output that never pauses at least every MAX_WAIT_MS', () => {
    const s = scanner();
    s.push(trace());
    for (let t = 0; t < MAX_WAIT_MS + SCAN_DELAY_MS; t += 100) {
      vi.advanceTimersByTime(100);
      s.push('GET /api/cart 200\r\n');
    }
    expect(found).toHaveLength(1);
  });

  it('marks errors of a dev server and of Docker Compose logs', () => {
    const s = scanner();
    s.push('\r\n  VITE v7.2.4  ready in 412 ms\r\n');
    vi.advanceTimersByTime(SCAN_DELAY_MS);
    s.push(trace());
    vi.advanceTimersByTime(SCAN_DELAY_MS);
    expect(found[0]!.errors[0]!.origin).toBe('dev-server');

    const d = scanner();
    d.push(
      'api-1  | Traceback (most recent call last):\napi-1  |   File "/app/app/models.py", line 2, in parse\napi-1  | ValueError: x\n',
    );
    d.flush();
    expect(found[1]!.errors[0]!.origin).toBe('docker');
  });

  it('drops repeats and caps the rate', () => {
    const s = scanner();
    s.push(trace());
    s.flush();
    s.push(trace());
    s.flush();
    expect(found).toHaveLength(1);
    vi.advanceTimersByTime(REPEAT_WINDOW_MS + 1);
    s.push(trace());
    s.flush();
    expect(found).toHaveLength(2);

    const before = found.length;
    const flood = scanner();
    for (let i = 0; i < MAX_ERRORS_PER_MINUTE + 10; i++) {
      flood.push(trace(`f${i}`));
      flood.flush();
    }
    const reported = found.slice(before).flatMap((f) => f.errors);
    expect(reported).toHaveLength(MAX_ERRORS_PER_MINUTE);
    vi.advanceTimersByTime(60_001);
    flood.push(trace('later'));
    flood.flush();
    expect(found.at(-1)!.errors[0]!.message).toBe('TypeError: boom in later');
  });

  it('reports nothing after dispose', () => {
    const s = scanner();
    s.push(trace());
    s.dispose();
    vi.advanceTimersByTime(SCAN_DELAY_MS * 2);
    s.flush();
    expect(found).toHaveLength(0);
  });
});
