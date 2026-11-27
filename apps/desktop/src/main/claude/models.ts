// What a Claude session can run with (phase 5f, ADR 0017): the models and efforts offered in the
// chat, and the defaults of the user's Claude Code configuration.
//
// Claude Code takes `--model <alias|name>` and `--effort <level>` on every `claude -p` run, and
// each turn of the app is its own run: a choice made in the chat applies from the next turn
// without restarting anything. The user's settings are only read, never written (rule 8).
import { open, type FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { effortSchema, modelIdSchema, redactSecrets } from '@control-center/event-schema';
import {
  isConfigInCatalog,
  type AgentCatalog,
  type AgentConfig,
  type AgentModel,
} from '@control-center/ipc-contract';

/** `--effort` levels of Claude Code 2.1.326 (`claude --help`). */
export const CLAUDE_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The aliases Claude Code resolves to the latest model of each family. */
export const CLAUDE_MODELS: readonly AgentModel[] = [
  { id: 'fable', label: 'Fable', efforts: [...CLAUDE_EFFORTS] },
  { id: 'opus', label: 'Opus', efforts: [...CLAUDE_EFFORTS] },
  { id: 'sonnet', label: 'Sonnet', efforts: [...CLAUDE_EFFORTS] },
  { id: 'haiku', label: 'Haiku', efforts: [...CLAUDE_EFFORTS] },
];

export const MAX_SETTINGS_BYTES = 256 * 1024;
const NONE: AgentConfig = { model: null, effort: null };

/**
 * A model id that may leave the main process: valid for the schema and left untouched by the
 * secret redaction. A value that looks like a credential would reach the renderer in the catalog
 * and, once cleaned, turn the event that names it into one outside the schema.
 */
export function safeModelId(value: unknown): string | null {
  const id = modelIdSchema.safeParse(value).data;
  return id !== undefined && redactSecrets(id) === id ? id : null;
}

/**
 * Reads at most `max` bytes from an open file; undefined when it is not a regular file or holds
 * more. The size is checked on the descriptor and again on what is read: a file that grows or is
 * replaced after the check cannot push past the limit.
 */
export async function readLimited(handle: FileHandle, max: number): Promise<string | undefined> {
  const info = await handle.stat();
  if (!info.isFile() || info.size > max) return undefined;
  const buffer = Buffer.alloc(max + 1);
  let length = 0;
  while (length < buffer.length) {
    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
    if (bytesRead === 0) break;
    length += bytesRead;
  }
  return length > max ? undefined : buffer.subarray(0, length).toString('utf8');
}

/**
 * `model` and `effortLevel` of `~/.claude/settings.json`, when present and valid. Anything else
 * (missing file, too large, not JSON, a value outside the schemas, a credential-like model) reads
 * as "not set". The file is opened once, read-only, and never written (rule 8).
 */
export async function readClaudeDefaults(home: string = homedir()): Promise<AgentConfig> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(join(home, '.claude', 'settings.json'), 'r');
    const text = await readLimited(handle, MAX_SETTINGS_BYTES);
    if (text === undefined) return NONE;
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return NONE;
    const settings = value as Record<string, unknown>;
    return {
      model: safeModelId(settings.model),
      effort: effortSchema.safeParse(settings.effortLevel).data ?? null,
    };
  } catch {
    return NONE;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * The catalog of a session: the aliases, plus the configured model when it is a full name the
 * aliases do not cover. `chosen` (the last choice of a resumed session) becomes the current choice
 * only if this catalog offers it: a saved value never adds a model or an effort by itself.
 */
export function claudeCatalog(defaults: AgentConfig, chosen?: AgentConfig): AgentCatalog {
  const models = [...CLAUDE_MODELS];
  const configured = safeModelId(defaults.model);
  if (configured !== null && !models.some((m) => m.id === configured))
    models.push({ id: configured, label: configured, efforts: [...CLAUDE_EFFORTS] });
  const current =
    chosen &&
    (chosen.model === null || safeModelId(chosen.model) !== null) &&
    isConfigInCatalog(chosen, models)
      ? chosen
      : NONE;
  return { models, defaults: { ...defaults, model: configured }, current };
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
