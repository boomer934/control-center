import { describe, expect, it } from 'vitest';
import {
  acceptsCodexConfig,
  codexCatalog,
  codexDefaults,
  resolveCodexConfig,
  toAgentModel,
} from './models';

const efforts = (...e: string[]) =>
  e.map((reasoningEffort) => ({ reasoningEffort, description: '' }));
const SOL = toAgentModel({
  id: 'gpt-6.2-sol',
  displayName: 'GPT-6.2 Sol',
  supportedReasoningEfforts: efforts('low', 'high', 'ultra'),
  defaultReasoningEffort: 'low',
})!;
const LUNA = toAgentModel({
  id: 'gpt-6-luna',
  supportedReasoningEfforts: efforts('low', 'medium'),
  defaultReasoningEffort: 'medium',
})!;
const catalog = { models: [SOL, LUNA], defaults: { model: 'gpt-6.2-sol', effort: 'high' } };

describe('toAgentModel', () => {
  it('keeps only safe ids and efforts, and drops hidden models', () => {
    expect(SOL).toEqual({
      id: 'gpt-6.2-sol',
      label: 'GPT-6.2 Sol',
      efforts: ['low', 'high', 'ultra'],
      defaultEffort: 'low',
    });
    expect(toAgentModel({ id: '--model evil' })).toBeUndefined();
    expect(toAgentModel({ id: 'x', hidden: true })).toBeUndefined();
    expect(
      toAgentModel({
        id: 'x',
        supportedReasoningEfforts: efforts('LOW "', 'low'),
        defaultReasoningEffort: 'max',
      }),
    ).toEqual({
      id: 'x',
      label: 'x',
      efforts: ['low'],
    });
    expect(codexDefaults('gpt 6', 'High')).toEqual({ model: null, effort: null });
  });
});

describe('acceptsCodexConfig', () => {
  it('checks the effort against the model the choice resolves to', () => {
    expect(acceptsCodexConfig({ model: null, effort: null }, catalog)).toBe(true);
    expect(acceptsCodexConfig({ model: 'gpt-6-luna', effort: 'medium' }, catalog)).toBe(true);
    expect(acceptsCodexConfig({ model: 'gpt-6-luna', effort: 'ultra' }, catalog)).toBe(false);
    // no model: the configured one (Sol) must take the effort, not just any model
    expect(acceptsCodexConfig({ model: null, effort: 'ultra' }, catalog)).toBe(true);
    expect(acceptsCodexConfig({ model: null, effort: 'medium' }, catalog)).toBe(false);
    expect(
      acceptsCodexConfig(
        { model: null, effort: 'low' },
        { ...catalog, defaults: { model: null, effort: null } },
      ),
    ).toBe(false);
    expect(acceptsCodexConfig({ model: 'unknown', effort: null }, catalog)).toBe(false);
  });
});

describe('resolveCodexConfig', () => {
  it('always names a model and an effort, going back to the configured ones on null', () => {
    expect(resolveCodexConfig({ model: null, effort: null }, catalog)).toEqual({
      model: 'gpt-6.2-sol',
      effort: 'high',
    });
    expect(resolveCodexConfig({ model: 'gpt-6-luna', effort: null }, catalog)).toEqual({
      model: 'gpt-6-luna',
      effort: 'medium',
    });
    expect(resolveCodexConfig({ model: 'gpt-6.2-sol', effort: null }, catalog)).toEqual({
      model: 'gpt-6.2-sol',
      effort: 'high',
    });
    expect(resolveCodexConfig({ model: null, effort: 'low' }, catalog)).toEqual({
      model: 'gpt-6.2-sol',
      effort: 'low',
    });
    expect(
      resolveCodexConfig(
        { model: null, effort: null },
        { models: [], defaults: { model: null, effort: null } },
      ),
    ).toEqual({
      model: undefined,
      effort: undefined,
    });
  });
});

describe('codexCatalog', () => {
  it('keeps a saved choice only when it is still valid', () => {
    const saved = { model: 'gpt-6-luna', effort: 'low' };
    expect(codexCatalog([SOL, LUNA], catalog.defaults, saved).current).toBe(saved);
    expect(codexCatalog([SOL], catalog.defaults, saved).current).toEqual({
      model: null,
      effort: null,
    });
  });
});
