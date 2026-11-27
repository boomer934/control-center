import { describe, expect, it } from 'vitest';
import {
  codexFeatureCapabilities,
  codexHookCapabilities,
  codexMcpCapabilities,
  codexPluginCapabilities,
  codexProfileCapabilities,
  codexProviderCapabilities,
  codexSkillCapabilities,
  readCodexInventory,
} from './inventory';
import { CODEX_PROBE_METHODS } from './methods';

const SECRET = 'sk-ant-api03-' + 'a'.repeat(40);

describe('Codex inventory parsers', () => {
  it('reads features with their stage, and the announcement when there is no description', () => {
    const found = codexFeatureCapabilities([
      {
        name: 'fast_mode',
        stage: 'beta',
        displayName: 'Fast mode',
        description: null,
        announcement: 'NEW: faster turns',
        enabled: true,
        defaultEnabled: false,
      },
      { name: 'bad id', stage: 'stable', enabled: false, defaultEnabled: false },
      { name: 'no_stage', enabled: true },
    ]);
    expect(found).toEqual([
      {
        agent: 'codex',
        kind: 'feature',
        id: 'fast_mode',
        label: 'Fast mode',
        description: 'NEW: faster turns',
        tags: ['stage:beta', 'enabled'],
      },
      undefined,
    ]);
  });

  it('keeps the skills of the user and the system, not those of a repository', () => {
    const found = codexSkillCapabilities({
      data: [
        {
          cwd: 'C:\\x',
          errors: [],
          skills: [
            { name: 'animate', description: 'Long', enabled: true, scope: 'user', path: 'p' },
            { name: 'local', description: 'Repo', enabled: true, scope: 'repo', path: 'p' },
            {
              name: 'sys',
              description: 'Long',
              shortDescription: 'Short',
              enabled: false,
              scope: 'system',
              path: 'p',
              interface: { displayName: 'System skill' },
            },
          ],
        },
      ],
    });
    expect(found.map((c) => [c?.id, c?.label, c?.description, c?.tags])).toEqual([
      ['animate', 'animate', 'Long', ['scope:user', 'enabled']],
      ['sys', 'System skill', 'Short', ['scope:system', 'disabled']],
    ]);
  });

  it('keeps the user hooks, never the file path, and redacts their commands', () => {
    const found = codexHookCapabilities({
      data: [
        {
          cwd: 'C:\\x',
          errors: [],
          warnings: [],
          hooks: [
            {
              key: 'C:\\Users\\someone\\.codex\\hooks.json:x:0:0',
              eventName: 'userPromptSubmit',
              handlerType: 'command',
              command: `python hook.py --token ${SECRET}`,
              source: 'user',
              enabled: true,
            },
            { eventName: 'userPromptSubmit', handlerType: 'prompt', source: 'project' },
            {
              eventName: 'preToolUse',
              handlerType: 'mcpTool',
              server: 'guard',
              tool: 'check',
              source: 'user',
            },
          ],
        },
      ],
    });
    expect(found.map((c) => c?.id)).toEqual(['userPromptSubmit:0', 'preToolUse:0']);
    expect(found[0]?.description).not.toContain(SECRET);
    expect(found[0]?.description).toContain('python hook.py');
    expect(found[1]?.description).toBe('guard/check');
    expect(JSON.stringify(found)).not.toContain('someone');
  });

  it('keeps the installed plugins of every marketplace', () => {
    const found = codexPluginCapabilities({
      marketplaces: [
        {
          name: 'm',
          plugins: [
            {
              id: 'documents@m',
              name: 'documents',
              installed: true,
              enabled: true,
              interface: { displayName: 'Documents', shortDescription: 'Docs' },
            },
            { id: 'other@m', name: 'other', installed: false, enabled: false },
          ],
        },
      ],
    });
    expect(found).toEqual([
      {
        agent: 'codex',
        kind: 'plugin',
        id: 'documents@m',
        label: 'Documents',
        description: 'Docs',
        tags: ['enabled'],
      },
    ]);
  });

  it('lists each MCP server and its tools', () => {
    const found = codexMcpCapabilities([
      {
        name: 'github',
        authStatus: 'oAuth',
        serverInfo: { name: 'gh', title: 'GitHub', version: '1' },
        tools: { search: { name: 'search', description: 'Search code' }, list: {} },
      },
    ]);
    expect(found.map((c) => [c?.kind, c?.id, c?.label, c?.tags])).toEqual([
      ['mcp', 'github', 'GitHub', ['auth:oAuth', 'tools:2']],
      ['tool', 'mcp__github__search', 'search', ['mcp:github']],
      ['tool', 'mcp__github__list', 'list', ['mcp:github']],
    ]);
  });

  it('lists the provider capabilities that are on, and the profiles', () => {
    expect(
      codexProviderCapabilities({ imageGeneration: true, webSearch: false }).map((c) => c?.id),
    ).toEqual(['imageGeneration']);
    expect(
      codexProfileCapabilities([
        { id: ':read-only', description: null, allowed: true },
        { id: 'x y', allowed: true },
      ]).map((c) => c && [c.id, c.tags]),
    ).toEqual([[':read-only', ['allowed']], undefined]);
  });
});

describe('readCodexInventory', () => {
  function fakeRpc(answers: Record<string, (params: Record<string, unknown>) => unknown>) {
    const calls: [string, unknown][] = [];
    return {
      calls,
      request: <T>(method: string, params: unknown): Promise<T> => {
        calls.push([method, params]);
        const answer = answers[method];
        if (!answer) return Promise.reject(new Error('Unknown method'));
        return Promise.resolve(answer(params as Record<string, unknown>) as T);
      },
    };
  }

  it('calls only probe methods and covers only the kinds that answered', async () => {
    const rpc = fakeRpc({
      'model/list': () => ({
        data: [{ id: 'gpt-6.2-sol', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }],
        nextCursor: null,
      }),
      'experimentalFeature/list': (p) =>
        p.cursor
          ? { data: [{ name: 'b', stage: 'stable', enabled: true }], nextCursor: null }
          : { data: [{ name: 'a', stage: 'beta', enabled: false }], nextCursor: 'next' },
      'skills/list': () => ({ wrong: true }),
      'modelProvider/capabilities/read': () => ({ webSearch: true }),
    });
    const read = await readCodexInventory(rpc, { cwd: 'C:\\app', timeoutMs: 1000 });
    for (const [method] of rpc.calls) expect(CODEX_PROBE_METHODS.has(method)).toBe(true);
    expect(read.kinds).toEqual(['model', 'feature', 'capability']);
    expect(read.entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      'model:gpt-6.2-sol',
      'feature:a',
      'feature:b',
      'capability:webSearch',
    ]);
    expect(rpc.calls.find(([m]) => m === 'skills/list')?.[1]).toEqual({ cwds: ['C:\\app'] });
  });
});
