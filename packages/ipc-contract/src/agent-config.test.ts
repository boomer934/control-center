import { describe, expect, it } from 'vitest';
import {
  AgentCatalogSchema,
  AgentConfigSchema,
  isConfigInCatalog,
  MAX_AGENT_MODELS,
  type AgentModel,
} from './agent-config';
import { ClaudeConfigureSchema, ClaudeUpdateSchema } from './claude';

const models: AgentModel[] = [
  { id: 'opus', label: 'Opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', efforts: ['low', 'high'], defaultEffort: 'high' },
  { id: 'tiny', label: 'Tiny', efforts: [] },
];

describe('agent configuration', () => {
  it('accepts the CLI default, a known model and an effort the model takes', () => {
    expect(isConfigInCatalog({ model: null, effort: null }, models)).toBe(true);
    expect(isConfigInCatalog({ model: 'opus', effort: 'max' }, models)).toBe(true);
    expect(isConfigInCatalog({ model: 'gpt-6.2-sol', effort: null }, models)).toBe(true);
    // no model chosen: any effort some model of the catalog takes
    expect(isConfigInCatalog({ model: null, effort: 'xhigh' }, models)).toBe(true);
  });

  it('refuses a model outside the catalog and an effort the model does not take', () => {
    expect(isConfigInCatalog({ model: 'sonnet', effort: null }, models)).toBe(false);
    expect(isConfigInCatalog({ model: 'gpt-6.2-sol', effort: 'max' }, models)).toBe(false);
    expect(isConfigInCatalog({ model: 'tiny', effort: 'low' }, models)).toBe(false);
    expect(isConfigInCatalog({ model: null, effort: 'minimal' }, models)).toBe(false);
  });

  it('keeps values that could act as command line switches out of the contract', () => {
    for (const model of ['--model', '-x', 'gpt 6', 'a"b', 'x;y', '', 'a'.repeat(200)])
      expect(AgentConfigSchema.safeParse({ model, effort: null }).success).toBe(false);
    for (const effort of ['--max', 'High', 'very high', ''])
      expect(AgentConfigSchema.safeParse({ model: null, effort }).success).toBe(false);
    expect(
      AgentConfigSchema.safeParse({ model: 'claude-opus-5-5[1m]', effort: 'max' }).success,
    ).toBe(true);
  });

  it('validates the configure request and the config update', () => {
    const id = '7c1d1b4e-8a43-4c4f-9a8e-0f6c1c2d3e4f';
    expect(ClaudeConfigureSchema.safeParse({ id, model: 'opus', effort: 'high' }).success).toBe(
      true,
    );
    expect(ClaudeConfigureSchema.safeParse({ id, model: 'opus' }).success).toBe(false);
    const catalog = {
      models,
      defaults: { model: 'opus', effort: null },
      current: { model: null, effort: null },
    };
    expect(ClaudeUpdateSchema.safeParse({ kind: 'config', id, catalog }).success).toBe(true);
    const tooMany = Array.from({ length: MAX_AGENT_MODELS + 1 }, (_, i) => ({
      id: `m${i}`,
      label: `M${i}`,
      efforts: [],
    }));
    expect(AgentCatalogSchema.safeParse({ ...catalog, models: tooMany }).success).toBe(false);
  });
});
