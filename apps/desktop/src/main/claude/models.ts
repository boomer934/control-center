// What a Claude session can run with (phase 5f, ADR 0017): the models and efforts offered in the
// chat, and the defaults of the user's Claude Code configuration.
//
// Claude Code takes `--model <alias|name>` and `--effort <level>` on every `claude -p` run, and
// each turn of the app is its own run: a choice made in the chat applies from the next turn
// without restarting anything. The user's settings are only read, never written (rule 8).
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { effortSchema, modelIdSchema } from '@control-center/event-schema';
import type { AgentCatalog, AgentConfig, AgentModel } from '@control-center/ipc-contract';

/** `--effort` levels of Claude Code 2.1.326 (`claude --help`). */
export const CLAUDE_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The aliases Claude Code resolves to the latest model of each family. */
export const CLAUDE_MODELS: readonly AgentModel[] = [
  { id: 'fable', label: 'Fable', efforts: [...CLAUDE_EFFORTS] },
  { id: 'opus', label: 'Opus', efforts: [...CLAUDE_EFFORTS] },
  { id: 'sonnet', label: 'Sonnet', efforts: [...CLAUDE_EFFORTS] },
  { id: 'haiku', label: 'Haiku', efforts: [...CLAUDE_EFFORTS] },
];

const MAX_SETTINGS_BYTES = 256 * 1024;
const NONE: AgentConfig = { model: null, effort: null };

/**
 * `model` and `effortLevel` of `~/.claude/settings.json`, when present and valid. Anything else
 * (missing file, too large, not JSON, a value outside the schemas) reads as "not set".
 */
export async function readClaudeDefaults(home: string = homedir()): Promise<AgentConfig> {
  const file = join(home, '.claude', 'settings.json');
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_SETTINGS_BYTES) return NONE;
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (typeof value !== 'object' || value === null) return NONE;
    const settings = value as Record<string, unknown>;
    return {
      model: modelIdSchema.safeParse(settings.model).data ?? null,
      effort: effortSchema.safeParse(settings.effortLevel).data ?? null,
    };
  } catch {
    return NONE;
  }
}

/**
 * The catalog of a session: the aliases, plus the configured model when it is a full name the
 * aliases do not cover (so the selector can show and keep it).
 */
export function claudeCatalog(defaults: AgentConfig, current: AgentConfig): AgentCatalog {
  const models = [...CLAUDE_MODELS];
  for (const id of [defaults.model, current.model])
    if (id !== null && !models.some((m) => m.id === id))
      models.push({ id, label: id, efforts: [...CLAUDE_EFFORTS] });
  return { models, defaults, current };
}

/**
 * Command line switches for a run; nothing for the values left to the CLI. The values are
 * checked again here, the last step before the command line: never an argument that starts
 * with `-` or carries a space.
 */
export function claudeConfigArgs(config: AgentConfig): string[] {
  return [
    ...(config.model === null ? [] : ['--model', modelIdSchema.parse(config.model)]),
    ...(config.effort === null ? [] : ['--effort', effortSchema.parse(config.effort)]),
  ];
}
