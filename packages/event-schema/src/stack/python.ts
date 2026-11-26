// Python tracebacks: `Traceback (most recent call last):`, `  File "x.py", line 3, in fn` frames
// (outermost first) and the exception line, the first one that is not indented.
import { toInt, type Found, type RawFrame, type StackParser } from './types';

const START = /^Traceback \(most recent call last\):\s*$/;
const FRAME = /^\s+File "(.+?)", line (\d+)(?:, in (.+?))?\s*$/;

export const pythonParser: StackParser = {
  language: 'python',
  find(lines) {
    const out: Found[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!START.test(lines[i]!)) continue;
      const frames: RawFrame[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const line = lines[j]!;
        const m = FRAME.exec(line);
        if (m) {
          frames.push({
            path: m[1]!,
            line: toInt(m[2]),
            ...(m[3] ? { fn: m[3].slice(0, 200) } : {}),
          });
          continue;
        }
        if (/^\s/.test(line) || line === '') continue; // source line, carets, blank
        break;
      }
      const message = lines[j]?.trim();
      if (!message || frames.length === 0) continue;
      out.push({
        start: i,
        end: j + 1,
        error: { language: 'python', message, frames: frames.reverse() },
      });
      i = j;
    }
    return out;
  },
};
