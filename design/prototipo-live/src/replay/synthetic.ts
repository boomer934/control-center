// A small synthetic recording in the same shape as packages/fixtures/raw (stream-json + hooks),
// used by the unit tests so they never depend on the local, uncommitted raw fixtures.
const CWD = 'C:\\Users\\dev\\proj';
const T = (s: number) => new Date(Date.UTC(2026, 10, 14, 10, 0, 0) + s * 1000).toISOString();

const use = (id: string, name: string, input: object, s: number, parent: string | null = null) => ({
  type: 'assistant',
  timestamp: T(s),
  parent_tool_use_id: parent,
  message: { content: [{ type: 'tool_use', id, name, input }] },
});
const result = (id: string, s: number, content: string, isError = false) => ({
  type: 'user',
  timestamp: T(s),
  message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
});
const hook = (s: number, payload: object) => ({
  capturedAt: T(s),
  payload: { cwd: CWD, ...payload },
});
const pre = (s: number, id: string, tool: string) =>
  hook(s, { hook_event_name: 'PreToolUse', tool_use_id: id, tool_name: tool });
const post = (s: number, id: string, tool: string, tool_response: object = {}) =>
  hook(s, { hook_event_name: 'PostToolUse', tool_use_id: id, tool_name: tool, tool_response });

export const syntheticStream: unknown[] = [
  { type: 'system', subtype: 'init', cwd: CWD },
  use('r1', 'Read', { file_path: `${CWD}\\src\\a.ts` }, 1),
  result('r1', 1.1, 'contents'),
  use('ag', 'Agent', { description: 'Explore src', subagent_type: 'Explore' }, 2),
  use('s1', 'Glob', { pattern: '**/*', path: `${CWD}\\src` }, 2.5, 'ag'),
  result('s1', 2.6, 'src\\a.ts\nsrc\\b.ts'),
  result('ag', 4, 'done'),
  use('e1', 'Edit', { file_path: `${CWD}\\src\\b.ts` }, 5),
  result('e1', 5.1, 'ok'),
  use('b1', 'Bash', { command: `cd ${CWD} && npm test` }, 6),
  result('b1', 7, 'tests 3\nfail 1'),
  use('r2', 'Read', { file_path: `${CWD}\\config\\missing.json` }, 8),
  result('r2', 8.1, 'File does not exist.', true),
  use('p1', 'PowerShell', { command: 'npx tsc' }, 9),
  { type: 'system', subtype: 'permission_denied', tool_use_id: 'p1' },
  result('p1', 9.05, 'requires approval', true),
  { type: 'system', subtype: 'post_turn_summary', status_detail: `Edited ${CWD}\\src\\b.ts` },
  {
    type: 'result',
    is_error: false,
    total_cost_usd: 0.12,
    usage: { input_tokens: 10, output_tokens: 90, cache_read_input_tokens: 900 },
  },
];

export const syntheticHooks: unknown[] = [
  hook(0, { hook_event_name: 'UserPromptSubmit', prompt: `Fix ${CWD}\\src\\b.ts` }),
  pre(1, 'r1', 'Read'),
  post(1.1, 'r1', 'Read'),
  pre(2, 'ag', 'Agent'),
  pre(2.5, 's1', 'Glob'),
  post(2.6, 's1', 'Glob', { filenames: ['src\\a.ts', 'src\\b.ts'] }),
  post(4, 'ag', 'Agent'),
  pre(5, 'e1', 'Edit'),
  post(5.1, 'e1', 'Edit', {
    structuredPatch: [{ lines: ['-old', '+new', '+more', ' same'] }],
  }),
  pre(6, 'b1', 'Bash'),
  post(7, 'b1', 'Bash', { stdout: 'tests 3\nfail 1' }),
  pre(8, 'r2', 'Read'),
  pre(9, 'p1', 'PowerShell'),
  hook(10, { hook_event_name: 'Stop' }),
];
