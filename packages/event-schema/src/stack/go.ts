// Go panics (`panic: …`, then `goroutine 1 [running]:` and function / `\tfile.go:12 +0x1d`
// pairs, innermost first) and build errors (`./x.go:4:9: undefined: missing`).
import { toInt, type Found, type RawFrame, type StackParser } from './types';

const PANIC = /^(panic|fatal error): (.*)$/;
const GOROUTINE = /^goroutine \d+ \[.*\]:\s*$/;
const LOCATION = /^\t(.+?\.go):(\d+)(?: \+0x[0-9a-f]+)?\s*$/;
const FUNCTION = /^(\S.*)\(.*\)\s*$/;
const BUILD = /^(\S.*?\.go):(\d+):(\d+): (.*)$/;

export const goParser: StackParser = {
  language: 'go',
  find(lines) {
    const out: Found[] = [];
    for (let i = 0; i < lines.length; i++) {
      const build = BUILD.exec(lines[i]!);
      if (build) {
        out.push({
          start: i,
          end: i + 1,
          error: {
            language: 'go',
            message: build[4]!.trim(),
            frames: [{ path: build[1]!, line: toInt(build[2]), column: toInt(build[3]) }],
          },
        });
        continue;
      }
      const panic = PANIC.exec(lines[i]!);
      if (!panic) continue;
      let j = i + 1;
      while (j < lines.length && !GOROUTINE.test(lines[j]!) && j - i < 4) j++;
      if (!GOROUTINE.test(lines[j] ?? '')) continue;
      const frames: RawFrame[] = [];
      for (j++; j + 1 < lines.length; j += 2) {
        const fn = FUNCTION.exec(lines[j]!);
        const at = LOCATION.exec(lines[j + 1]!);
        if (!fn || !at) break;
        frames.push({ path: at[1]!, line: toInt(at[2]), fn: fn[1]!.slice(0, 200) });
      }
      out.push({
        start: i,
        end: j,
        error: { language: 'go', message: `${panic[1]}: ${panic[2]!.trim()}`, frames },
      });
      i = j - 1;
    }
    return out;
  },
};
