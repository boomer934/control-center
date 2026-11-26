// Rust panics (`thread 'main' panicked at src/x.rs:2:5:` and the message on the next line, or the
// older `panicked at 'msg', src/x.rs:2:5`), their backtrace (`  3: fn` / `at ./src/x.rs:2`), and
// compiler errors (`error[E0425]: …` / ` --> src/x.rs:2:12`).
import { toInt, type Found, type RawFrame, type StackParser } from './types';

const PANIC = /^thread '(.*?)'(?: \(\d+\))? panicked at (.+?):(\d+):(\d+):\s*$/;
const PANIC_OLD = /^thread '(.*?)'(?: \(\d+\))? panicked at '(.*)', (.+?):(\d+):(\d+)\s*$/;
const BACKTRACE = /^stack backtrace:\s*$/;
const FRAME_FN = /^\s+\d+: (.+?)\s*$/;
const FRAME_AT = /^\s+at (.+?):(\d+)(?::(\d+))?\s*$/;
const COMPILE = /^error(\[E\d+\])?: (.*)$/;
const ARROW = /^\s*--> (.+?):(\d+):(\d+)\s*$/;

export const rustParser: StackParser = {
  language: 'rust',
  find(lines) {
    const out: Found[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const compile = COMPILE.exec(line);
      if (compile) {
        const arrow = [1, 2].map((k) => ARROW.exec(lines[i + k] ?? '')).find(Boolean);
        if (arrow) {
          out.push({
            start: i,
            end: i + 1 + [1, 2].findIndex((k) => ARROW.test(lines[i + k] ?? '')) + 1,
            error: {
              language: 'rust',
              message: `error${compile[1] ?? ''}: ${compile[2]!.trim()}`,
              frames: [{ path: arrow[1]!, line: toInt(arrow[2]), column: toInt(arrow[3]) }],
            },
          });
        }
        continue;
      }
      const panic = PANIC.exec(line);
      const old = panic ? undefined : PANIC_OLD.exec(line);
      if (!panic && !old) continue;
      let j = i + 1;
      let message: string;
      let frames: RawFrame[];
      if (panic) {
        message = (lines[j] ?? '').trim();
        j++;
        frames = [{ path: panic[2]!, line: toInt(panic[3]), column: toInt(panic[4]) }];
      } else {
        message = old![2]!;
        frames = [{ path: old![3]!, line: toInt(old![4]), column: toInt(old![5]) }];
      }
      if (BACKTRACE.test(lines[j] ?? '')) {
        for (j++; j < lines.length;) {
          const fn = FRAME_FN.exec(lines[j]!);
          if (!fn) break;
          const at = FRAME_AT.exec(lines[j + 1] ?? '');
          if (at) {
            frames.push({
              path: at[1]!,
              line: toInt(at[2]),
              ...(at[3] ? { column: toInt(at[3]) } : {}),
              fn: fn[1]!.slice(0, 200),
            });
            j += 2;
          } else j++;
        }
      }
      out.push({
        start: i,
        end: j,
        error: { language: 'rust', message: message || 'panic', frames },
      });
      i = j - 1;
    }
    return out;
  },
};
