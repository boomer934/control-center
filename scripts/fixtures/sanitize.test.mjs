import { describe, expect, it } from 'vitest';
import {
  checkDir,
  checkValue,
  cleanHookRecord,
  cleanStreamLine,
  FAKE_HOME,
  FAKE_WORKSPACE,
  makeCleaner,
  redactLines,
  SANITIZED_DIR,
  sanitizeSession,
} from './sanitize.mjs';

// A fake recording machine: nothing here is the real identity of anyone.
const ID = {
  home: 'C:\\Users\\ada',
  username: 'ada',
  hostname: 'ADA-LAPTOP',
  gitName: 'ada-lovelace',
  gitEmail: 'ada@analytical.engine',
};
const CWD = 'C:\\Users\\ada\\Desktop\\demo';
const j = (...parts) => parts.join('');
const SECRET = j('sk-', 'ant-', 'api03-', 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4');

describe('makeCleaner', () => {
  const clean = makeCleaner(CWD, ID);

  it('replaces the workspace in every form', () => {
    for (const form of [
      'C:\\Users\\ada\\Desktop\\demo\\src\\a.js',
      'C:/Users/ada/Desktop/demo/src/a.js',
      'c:\\users\\ada\\desktop\\demo\\src\\a.js',
      '/c/Users/ada/Desktop/demo/src/a.js',
    ])
      expect(clean(form)).toMatch(
        /^(C:\\fixtures\\workspace\\src\\a\.js|C:\/fixtures\/workspace\/src\/a\.js|\/c\/fixtures\/workspace\/src\/a\.js)$/,
      );
    expect(clean('"C:\\\\Users\\\\ada\\\\Desktop\\\\demo\\\\x"')).toBe(
      '"C:\\\\fixtures\\\\workspace\\\\x"',
    );
  });

  it('replaces the home, any other home, the user name, host name and git identity', () => {
    expect(clean('C:\\Users\\ada\\.claude\\settings.json')).toBe(
      `${FAKE_HOME}\\.claude\\settings.json`,
    );
    expect(clean('C:\\Users\\bob\\x and /home/carol/y')).toBe(
      'C:\\Users\\user\\x and /home/user/y',
    );
    expect(clean('ada on ADA-LAPTOP, ada-lovelace <ada@analytical.engine>')).toBe(
      'user on host, user <user@example.com>',
    );
    expect(clean('mail me at someone@corp.example.org')).toBe('mail me at user@example.com');
  });

  it('redacts secrets and truncates long text', () => {
    expect(clean(`key ${SECRET}`)).toBe('key <redacted:anthropic-key>');
    expect(clean('x'.repeat(5000)).endsWith('…[truncated]')).toBe(true);
  });
});

describe('redactLines', () => {
  it('keeps the line count and the trailing newline', () => {
    expect(redactLines('a\nb\nc\n')).toBe('<redacted>\n<redacted>\n<redacted>\n');
    expect(redactLines('a\nb')).toBe('<redacted>\n<redacted>');
    expect(redactLines('')).toBe('');
  });
});

describe('structural rules', () => {
  const clean = makeCleaner(CWD, ID);

  it('keeps only the allowed init keys and built-in tools', () => {
    const out = cleanStreamLine(
      {
        type: 'system',
        subtype: 'init',
        cwd: CWD,
        model: 'm',
        tools: ['Read', 'mcp__gmail__send'],
        mcp_servers: [{ name: 'gmail' }],
        skills: ['private-skill'],
        plugins: [{ path: 'C:\\Users\\ada\\x' }],
        memory_paths: { auto: 'C:\\Users\\ada\\mem' },
      },
      clean,
      new Map(),
    );
    expect(out).toEqual({
      type: 'system',
      subtype: 'init',
      cwd: FAKE_WORKSPACE,
      model: 'm',
      tools: ['Read'],
    });
  });

  it('replaces file contents and drops originalFile, thinking and signatures', () => {
    const tools = new Map();
    const call = cleanStreamLine(
      {
        type: 'assistant',
        wire_tool_inputs: { t: {} },
        message: {
          id: 'msg_1',
          content: [
            { type: 'thinking', thinking: 'secret plan', signature: 'AbC'.repeat(30) },
            {
              type: 'tool_use',
              id: 't1',
              name: 'Edit',
              input: { file_path: `${CWD}\\a.js`, old_string: 'x\ny', new_string: 'z' },
            },
          ],
        },
      },
      clean,
      tools,
    );
    expect(JSON.stringify(call)).not.toMatch(/secret plan|AbCAbC|wire_tool_inputs/);
    expect(call.message.content[1].input).toEqual({
      file_path: `${FAKE_WORKSPACE}\\a.js`,
      old_string: '<redacted>\n<redacted>',
      new_string: '<redacted>',
    });
    const result = cleanStreamLine(
      {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'updated' }] },
        tool_use_result: {
          filePath: `${CWD}\\a.js`,
          originalFile: 'PRIVATE CONTENT',
          structuredPatch: [
            { oldStart: 1, oldLines: 2, newStart: 1, newLines: 1, lines: ['-x', '-y', '+z'] },
          ],
        },
      },
      clean,
      tools,
    );
    expect(JSON.stringify(result)).not.toContain('PRIVATE CONTENT');
    expect(result.tool_use_result.structuredPatch[0].lines).toEqual([
      '-<redacted>',
      '-<redacted>',
      '+<redacted>',
    ]);
  });

  it('keeps tool error messages and Grep locations', () => {
    const tools = new Map([
      ['r', 'Read'],
      ['g', 'Grep'],
    ]);
    const out = cleanStreamLine(
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'r',
              is_error: true,
              content: 'File does not exist.',
            },
            { type: 'tool_result', tool_use_id: 'g', content: 'src\\a.js:3:const token = 1' },
          ],
        },
      },
      clean,
      tools,
    );
    expect(out.message.content.map((c) => c.content)).toEqual([
      'File does not exist.',
      'src\\a.js:3:<redacted>',
    ]);
  });

  it('drops hook paths that point into the user profile', () => {
    const out = cleanHookRecord(
      {
        capturedAt: '2026-11-14T10:00:00.000Z',
        payload: {
          hook_event_name: 'Stop',
          cwd: CWD,
          transcript_path: 'C:\\Users\\ada\\.claude\\projects\\x.jsonl',
          scratchpad_dir: 'C:\\Users\\ada\\AppData\\Local\\Temp\\x',
        },
      },
      clean,
    );
    expect(out).toEqual({
      capturedAt: '2026-11-14T10:00:00.000Z',
      payload: { hook_event_name: 'Stop', cwd: FAKE_WORKSPACE },
    });
  });

  it('produces a session the check accepts', () => {
    const { stream, hooks } = sanitizeSession(
      [
        { type: 'system', subtype: 'init', cwd: CWD },
        { type: 'result', result: `done by ada, ${SECRET}` },
      ],
      [
        {
          capturedAt: 'x',
          payload: { hook_event_name: 'UserPromptSubmit', cwd: CWD, prompt: `use ${CWD}` },
        },
      ],
      ID,
    );
    expect(checkValue({ stream, hooks }, ID)).toEqual([]);
  });
});

describe('check', () => {
  it('finds secrets, personal paths, identities, forbidden keys and high-entropy strings', () => {
    const rules = checkValue(
      {
        a: `key ${SECRET}`,
        b: 'C:\\Users\\ada\\x',
        c: 'built on ADA-LAPTOP',
        originalFile: '…',
        d: j('Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lm', 'Nb8Vc7Xz6'),
        e: 'write to bob@corp.example.org',
      },
      ID,
    ).map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'secret:anthropic-key',
        'home-path',
        'local-identity',
        'forbidden-key',
        'high-entropy',
        'email',
      ]),
    );
  });

  it('accepts ids, placeholders and the fake paths', () => {
    expect(
      checkValue(
        {
          id: 'toolu_01YMBxTJDNn3qo25HDxuruTq',
          uuid: 'b38a8fc6-2151-4305-b772-c74be53a2ae0',
          path: `${FAKE_WORKSPACE}\\src\\a.js`,
          home: `${FAKE_HOME}\\x`,
          text: '<redacted:anthropic-key> user@example.com',
        },
        ID,
      ),
    ).toEqual([]);
  });

  it('finds nothing in the committed sanitized fixtures', () => {
    const { files, findings } = checkDir(SANITIZED_DIR, null);
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(findings).toEqual([]);
  });
});
