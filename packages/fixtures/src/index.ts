// Loader for the sanitized fixtures in packages/fixtures/sanitized/ (the only recordings that are
// ever committed). Names are validated, so no path ever comes from the caller.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SANITIZED_DIR = fileURLToPath(new URL('../sanitized/', import.meta.url));

/** The fake `claude` executable for tests: replays a recording (see bin/fake-claude.mjs). */
export const FAKE_CLAUDE = fileURLToPath(new URL('../bin/fake-claude.mjs', import.meta.url));

/** The fake `codex app-server` for tests: plays scripted turns (see bin/fake-codex.mjs). */
export const FAKE_CODEX = fileURLToPath(new URL('../bin/fake-codex.mjs', import.meta.url));

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;

function readJsonl(file: string): unknown[] {
  const out: unknown[] = [];
  readFileSync(new URL(file, new URL('../sanitized/', import.meta.url)), 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        out.push(JSON.parse(line));
      } catch {
        throw new Error(`${file}:${i + 1} is not valid JSON`);
      }
    });
  return out;
}

/** Names of the recorded Claude Code sessions (`<name>.jsonl` + `<name>.hooks.jsonl`). */
export function listClaudeSessions(): string[] {
  if (!existsSync(SANITIZED_DIR)) return [];
  return readdirSync(SANITIZED_DIR)
    .filter(
      (f) => f.endsWith('.jsonl') && !f.endsWith('.hooks.jsonl') && !f.includes('.synthetic.'),
    )
    .map((f) => f.slice(0, -'.jsonl'.length))
    .filter((n) => NAME.test(n))
    .sort();
}

export interface ClaudeSessionFixture {
  name: string;
  stream: unknown[];
  hooks: unknown[];
}

export function loadClaudeSession(name: string): ClaudeSessionFixture {
  if (!NAME.test(name)) throw new Error(`invalid fixture name: ${JSON.stringify(name)}`);
  const hooksFile = `${name}.hooks.jsonl`;
  return {
    name,
    stream: readJsonl(`${name}.jsonl`),
    hooks: existsSync(join(SANITIZED_DIR, hooksFile)) ? readJsonl(hooksFile) : [],
  };
}

/** Hand-written fixtures in the documented format of a source we have not recorded yet. */
export function loadSynthetic(name: 'ollama-chat'): unknown[] {
  return readJsonl(`${name}.synthetic.jsonl`);
}
