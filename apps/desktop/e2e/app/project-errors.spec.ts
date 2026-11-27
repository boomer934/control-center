// Phase 5e end to end: an error printed by the project lands on the map and in the timeline.
// The terminal case runs real Node in the integrated PowerShell; the agent case replays the
// recorded session sessione-02 (a failing `npm test`) through the fake `claude`; the Docker and
// dev server cases print their output in the terminal while a session is open.
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

const FAKE_CLAUDE = resolve(__dirname, '../../../../packages/fixtures/bin/fake-claude.mjs');

let app: ElectronApplication;
let page: Page;
let fixture: string;
let ollama: Server;
let ollamaRequests: Array<{ path: string | undefined; body: unknown }>;
let holdFirstChat: boolean;
let firstChatClosed: boolean;

test.skip(process.platform !== 'win32', 'The terminal and the Claude session target Windows');

test.beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'cc-errors-e2e-'));
  const bin = join(fixture, 'bin');
  const cli = join(bin, 'node_modules', '@anthropic-ai', 'claude-code');
  await mkdir(cli, { recursive: true });
  await writeFile(join(bin, 'claude.cmd'), '@rem npm shim stand-in\r\n');
  await writeFile(
    join(cli, 'cli.js'),
    `import(${JSON.stringify(pathToFileURL(FAKE_CLAUDE).href)});\n`,
  );
  const shop = join(fixture, 'Shop');
  for (const dir of ['src/lib', 'test']) await mkdir(join(shop, dir), { recursive: true });
  await writeFile(
    join(shop, 'src/lib/price.js'),
    'function total(cart) {\n  return cart.items.reduce((s, i) => s + i.price, 0);\n}\nmodule.exports = { total };\n',
  );
  await writeFile(
    join(shop, 'src/cart.js'),
    "const { total } = require('./lib/price');\nfunction checkout(cart) {\n  return total(cart) * 1.22;\n}\ncheckout({});\n",
  );
  await writeFile(join(shop, 'test/cart.test.js'), "require('node:test');\n");
  const workspace = await realpath(shop);
  ollamaRequests = [];
  holdFirstChat = false;
  firstChatClosed = false;
  ollama = createServer(async (request, response) => {
    let input = '';
    for await (const chunk of request) input += String(chunk);
    const body: unknown = input ? JSON.parse(input) : null;
    ollamaRequests.push({ path: request.url, body });
    if (request.url === '/api/chat' && (body as { model: string }).model === 'small:latest') {
      if (holdFirstChat) {
        holdFirstChat = false;
        response.once('close', () => {
          firstChatClosed = true;
        });
        return;
      }
      response.writeHead(500).end();
      return;
    }
    const result =
      request.url === '/api/tags'
        ? {
            models: [
              { name: 'renamed:latest', size: 1, remote_model: 'hosted' },
              { name: 'remote:cloud', size: 2 },
              { name: 'opaque:latest', size: 3 },
              { name: 'small:latest', size: 4 },
              { name: 'qwen-coder:7b', size: 7 },
            ],
          }
        : request.url === '/api/show'
          ? {
              capabilities: ['completion'],
              ...((body as { model: string }).model === 'opaque:latest'
                ? { remote_host: 'https://example.invalid' }
                : {}),
            }
          : {
              done: true,
              message: { role: 'assistant', content: 'Check why cart.items is undefined.' },
            };
    response.end(JSON.stringify(result));
  });
  ollama.listen(0, '127.0.0.1');
  await once(ollama, 'listening');
  const address = ollama.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  ({ app, page } = await launchApp({
    userDataDir: join(fixture, 'user-data'),
    env: {
      Path: `${bin};${process.env.Path ?? process.env.PATH ?? ''}`,
      FAKE_CLAUDE_FIXTURE: 'sessione-02',
      CC_E2E_OLLAMA_PORT: String(address.port),
    },
  }));
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, workspace);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch workspace' }).getByText('Open folder…').click();
  await expect(page.getByTestId('status-bar')).toContainText('Shop');
  await expect(page.getByTestId('live-map')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
});

test.afterEach(async () => {
  await app?.close();
  if (ollama?.listening) {
    ollama.close();
    await once(ollama, 'close');
  }
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

const node = (path: string) => page.locator(`[data-node="${path}"]`);

/**
 * Opens a node in the inspector. A new error can lay the map out again right under the cursor
 * (slow CI runner), so the click is retried once the layout is ready until the inspector shows
 * `text`. Selecting a node is idempotent, so a repeated click never closes the inspector.
 */
async function inspectNode(path: string, text: string) {
  const inspector = page.getByRole('region', { name: 'Event inspector' });
  await expect(async () => {
    await expect(page.getByTestId('live-map')).toHaveAttribute('data-ready', 'true');
    await node(path).click({ timeout: 5_000 });
    await expect(inspector).toContainText(text, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return inspector;
}

test('a terminal error lights the culprit and offers all three actions before a session', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Control+Backquote');
  const terminal = page.getByRole('region', { name: 'Terminal' });
  await terminal.getByRole('button', { name: 'PowerShell', exact: true }).click();
  await expect(terminal.locator('.xterm-rows')).toContainText('Shop', { timeout: 15_000 });
  await terminal.locator('textarea').focus();
  await page.keyboard.type('node src/cart.js');
  await page.keyboard.press('Enter');
  await expect(terminal.locator('.xterm-rows')).toContainText('Node.js v', { timeout: 15_000 });

  // The innermost frame in the workspace is the culprit, not the caller.
  await expect(node('src/lib/price.js')).toHaveAttribute('data-state', 'error', {
    timeout: 10_000,
  });
  await expect(node('src/lib/price.js')).toContainText('L2 TypeError');
  // the caller is on the map (it imports the culprit) but is not the culprit
  await expect(node('src/cart.js')).not.toHaveAttribute('data-state', 'error');

  const map = page.getByTestId('live-map');
  const viewport = map.locator('.react-flow__viewport');
  await page.getByTestId('map-fit').click();
  const originalWidth = await map.evaluate((element) => element.clientWidth);
  const beforeInspection = await viewport.evaluate((element) => element.style.transform);
  await node('src/lib/price.js').click();
  const inspector = page.getByRole('region', { name: 'Event inspector' });
  const actions = inspector.getByRole('group', { name: 'Project error actions' });
  await expect(inspector).toContainText('src/lib/price.js:2:21');
  await expect
    .poll(() => map.evaluate((element) => element.clientWidth))
    .toBeLessThan(originalWidth);
  expect(await viewport.evaluate((element) => element.style.transform)).toBe(beforeInspection);
  const goToFile = actions.getByRole('button', { name: 'Go to file' });
  await goToFile.click();
  const source = page.getByRole('dialog', { name: 'src/lib/price.js:2:21' });
  await expect(source.locator('mark')).toHaveText(
    'return cart.items.reduce((s, i) => s + i.price, 0);',
  );
  await expect(source.getByLabel('Source file')).toContainText('module.exports');
  await page.keyboard.press('Escape');
  await expect(source).toHaveCount(0);
  await expect(goToFile).toBeFocused();

  await actions.getByRole('button', { name: 'Explain locally' }).click();
  await expect(inspector.getByRole('region', { name: 'Local explanation' })).toContainText(
    'Check why cart.items is undefined.',
  );
  expect(ollamaRequests.map(({ path }) => path)).toEqual([
    '/api/tags',
    '/api/show',
    '/api/show',
    '/api/show',
    '/api/chat',
    '/api/chat',
  ]);
  expect(ollamaRequests.at(-2)?.body).toMatchObject({ model: 'small:latest' });
  expect(ollamaRequests.at(-1)?.body).toMatchObject({
    model: 'qwen-coder:7b',
    stream: false,
    messages: [
      { role: 'system' },
      { role: 'user', content: expect.stringContaining('src/lib/price.js') },
    ],
  });

  const chat = page.getByRole('complementary', { name: 'Session' });
  const draft = chat.getByRole('textbox', { name: 'Message Claude' });
  await draft.fill('Please add a regression test.');
  await page.keyboard.press('Control+Alt+B');
  await expect(chat).toHaveCount(0);
  await actions.getByRole('button', { name: 'Ask Claude to fix' }).click();
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue(
    /Please add a regression test\.[\s\S]*Investigate and fix[\s\S]*TypeError/,
  );
  await expect(chat.getByText('Please add a regression test.', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+Alt+B');
  await expect(chat).toHaveCount(0);
  await page.keyboard.press('Control+Alt+B');
  await expect(draft).toHaveValue(/Investigate and fix/);
  await expect(draft).not.toBeFocused();
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Session timeline' })
      .getByRole('button', { name: 'Turn completed', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
});

test('selecting another error cancels the pending request and frees Ollama', async () => {
  holdFirstChat = true;
  await writeNodeTrace('second.log', 'Second error');
  const run = await openTerminal();
  await run('node src/cart.js', 'Node.js v');
  await run('Get-Content second.log');
  await expect(node('test/cart.test.js')).toHaveAttribute('data-state', 'error');

  const inspector = await inspectNode('src/lib/price.js', 'src/lib/price.js:2');
  const explain = inspector.getByRole('button', { name: 'Explain locally' });
  await explain.click();
  await expect.poll(() => ollamaRequests.some(({ path }) => path === '/api/chat')).toBe(true);
  await inspectNode('test/cart.test.js', 'Second error');
  await expect(inspector.getByText('Waiting for Ollama…')).toHaveCount(0);
  await expect(inspector.getByRole('region', { name: 'Local explanation' })).toHaveCount(0);
  await expect(explain).toBeEnabled();
  await expect.poll(() => firstChatClosed).toBe(true);
  await explain.click();
  await expect(inspector.getByRole('region', { name: 'Local explanation' })).toBeVisible();
  expect(ollamaRequests.at(-1)?.body).toMatchObject({
    messages: [
      { role: 'system' },
      { role: 'user', content: expect.stringContaining('Second error') },
    ],
  });
});

test('switching between errors in the same file clears and cancels local explanations', async () => {
  await writeNodeTrace('first.log', 'First error');
  await writeNodeTrace('second.log', 'Second error');
  const timeline = await runTurn();
  const run = await openTerminal();
  const first = timeline.getByRole('button', { name: 'Error · Error: First error', exact: true });
  const second = timeline.getByRole('button', { name: 'Error · Error: Second error', exact: true });
  await run('Get-Content first.log');
  await expect(first).toBeVisible();
  await run('Get-Content second.log');
  await expect(second).toBeVisible();

  const inspector = page.getByRole('region', { name: 'Event inspector' });
  const explain = inspector.getByRole('button', { name: 'Explain locally' });
  const explanation = inspector.getByRole('region', { name: 'Local explanation' });
  await first.click();
  await expect(inspector).toContainText('test/cart.test.js:1');
  await explain.click();
  await expect(explanation).toBeVisible();
  await second.click();
  await expect(inspector).toContainText('Second error');
  await expect(inspector).toContainText('test/cart.test.js:1');
  await expect(explanation).toHaveCount(0);

  await first.click();
  holdFirstChat = true;
  await explain.click();
  await expect.poll(() => holdFirstChat).toBe(false);
  await expect(inspector.getByText('Waiting for Ollama…')).toBeVisible();
  await second.click();
  await expect(inspector).toContainText('Second error');
  await expect(inspector.getByText('Waiting for Ollama…')).toHaveCount(0);
  await expect(explain).toBeEnabled();
  await expect.poll(() => firstChatClosed).toBe(true);
});

test('source locations stay inside the active workspace and must identify a real line', async () => {
  await writeFile(join(fixture, 'outside.js'), 'private');
  await symlink(fixture, join(fixture, 'Shop', 'outside'), 'junction');
  const results = await page.evaluate(async () => {
    const { active } = await window.api.workspace.getState();
    if (!active) throw new Error('Workspace missing');
    const read = (path: string, line = 1, workspaceId = active.id) =>
      window.api.workspace.readSourceLocation({ workspaceId, path, line });
    return Promise.all([
      read('outside/outside.js'),
      read('src/cart.js', 999),
      read('src/cart.js', 1, '0'.repeat(64)),
    ]);
  });
  expect(results).toEqual([null, null, null]);
  await expect(
    page.evaluate(async () => {
      const { active } = await window.api.workspace.getState();
      if (!active) throw new Error('Workspace missing');
      return window.api.workspace.readSourceLocation({
        workspaceId: active.id,
        path: '../outside.js',
        line: 1,
      });
    }),
  ).rejects.toThrow('[invalid-request]');
});

async function runTurn() {
  const dock = page.getByRole('complementary', { name: 'Session' });
  await dock.getByRole('textbox', { name: 'Message Claude' }).fill('Fix the discount');
  await dock.getByRole('button', { name: 'Send', exact: true }).click();
  const timeline = page.getByRole('region', { name: 'Session timeline' });
  await expect(timeline.getByRole('button', { name: 'Turn completed', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return timeline;
}

/**
 * A Node crash in test/cart.test.js, as printed with a path relative to the workspace. Real
 * Node prints absolute paths, which the console wraps in a narrow terminal (small CI screens).
 */
async function writeNodeTrace(name: string, message: string) {
  await writeFile(
    join(fixture, 'Shop', name),
    [
      'test/cart.test.js:1',
      'throw new Error(process.argv[2]);',
      '^',
      '',
      `Error: ${message}`,
      '    at Object.<anonymous> (test/cart.test.js:1:7)',
      '',
      'Node.js v24.0.0',
      '',
    ].join('\n'),
  );
}

async function openTerminal() {
  await page.keyboard.press('Control+Backquote');
  const terminal = page.getByRole('region', { name: 'Terminal' });
  await terminal.getByRole('button', { name: 'PowerShell', exact: true }).click();
  await expect(terminal.locator('.xterm-rows')).toContainText('Shop', { timeout: 15_000 });
  await terminal.locator('textarea').focus();
  let runs = 0;
  /**
   * Without `done`, waits for a marker printed after the command exits: the viewport shows only
   * the last rows, so a long stack trace can scroll any line of its output out of view. The
   * marker is built at run time, so the echoed command line never contains it.
   */
  return async (command: string, done?: string) => {
    const marker = done ?? `cc-e2e-done-${++runs}`;
    await terminal.locator('textarea').focus();
    await page.keyboard.type(done ? command : `${command}; 'cc-e2e-done-' + '${runs}'`);
    await page.keyboard.press('Enter');
    await expect(terminal.locator('.xterm-rows')).toContainText(marker, { timeout: 15_000 });
  };
}

test('Go to file does not show .env source', async () => {
  const shop = join(fixture, 'Shop');
  await writeFile(join(shop, '.env'), 'EXAMPLE=fixture-only\n');
  await writeFile(
    join(shop, 'dotenv-error.log'),
    [
      'Traceback (most recent call last):',
      '  File ".env", line 1, in <module>',
      'ValueError: Invalid environment file',
      '',
    ].join('\n'),
  );

  const run = await openTerminal();
  await run('Get-Content dotenv-error.log', 'ValueError: Invalid environment file');
  const culprit = node('.env');
  await expect(culprit).toHaveAttribute('data-state', 'error');
  const inspector = await inspectNode('.env', '.env:1');
  await inspector.getByRole('button', { name: 'Go to file' }).click();
  await expect(inspector.getByRole('status')).toContainText(
    'Source or line unavailable in this workspace.',
  );
  await expect(page.getByRole('dialog', { name: '.env:1', exact: true })).toHaveCount(0);
});

test('a Docker terminal error opens the resolved workspace source before a session', async () => {
  const shop = join(fixture, 'Shop');
  await mkdir(join(shop, 'api/app'), { recursive: true });
  await writeFile(join(shop, 'api/app/models.py'), 'def parse(row):\n    return int(row["qty"])\n');
  await writeFile(
    join(shop, 'compose.log'),
    [
      'api-1  | Traceback (most recent call last):',
      'api-1  |   File "/srv/api/app/models.py", line 2, in parse',
      'api-1  |     return int(row["qty"])',
      "api-1  | ValueError: invalid literal for int() with base 10: 'x'",
      'api-1 exited with code 1',
      '',
    ].join('\n'),
  );
  const run = await openTerminal();
  await run('Get-Content compose.log', 'exited with code 1');
  const culprit = node('api/app/models.py');
  await expect(culprit).toHaveAttribute('data-state', 'error', { timeout: 10_000 });
  await expect(page.getByTestId('live-map').getByText('No session yet')).toHaveCount(0);
  const inspector = await inspectNode('api/app/models.py', 'api/app/models.py:2');
  await expect(inspector).toContainText('Docker · python');
  await inspector.getByRole('button', { name: 'Go to file' }).click();
  const source = page.getByRole('dialog', { name: 'api/app/models.py:2', exact: true });
  await expect(source.locator('mark')).toHaveText('return int(row["qty"])');
});

test('a failing test run by the agent shows its error in the timeline, the inspector and the map', async () => {
  // sessione-02: `npm test` fails on an assertion, the agent fixes src/cart.js, the tests pass.
  const timeline = await runTurn();
  const mark = timeline.getByRole('button', { name: /^Error · AssertionError/ });
  await expect(mark).toHaveCount(1);
  await mark.click();
  // at that instant the assertion's file is red
  await expect(node('test/cart.test.js')).toHaveAttribute('data-state', 'error');
  await expect(node('test/cart.test.js')).toContainText('L10 AssertionError');
  const inspector = page.getByRole('region', { name: 'Event inspector' });
  await expect(inspector).toContainText('1090 !== 990');
  await expect(inspector).toContainText('test/cart.test.js:10:10');
  await expect(inspector).toContainText('Tests · node');
  // the same command passed later in the turn: back to live, the error is gone
  await timeline.getByRole('button', { name: 'Back to live' }).click();
  await expect(node('test/cart.test.js')).not.toHaveAttribute('data-state', 'error');
});

for (const example of [
  {
    name: 'Rust crate',
    command: 'cd rs && cargo run',
    output: "thread 'main' panicked at src/stock.rs:2:5:\nStock unavailable\n",
    message: 'Stock unavailable',
    path: 'rs/src/stock.rs',
    decoy: 'stock.rs',
    location: 'rs/src/stock.rs:2:5',
    source: 'fn main() {\n    panic!("Stock unavailable");\n}\n',
    line: 'panic!("Stock unavailable");',
  },
  {
    name: 'Docker container',
    command: 'docker compose logs api',
    output: [
      'api-1  | Traceback (most recent call last):',
      'api-1  |   File "/app/app/models.py", line 2, in parse',
      'api-1  |     return int(row["qty"])',
      'api-1  | ValueError: Invalid quantity',
    ].join('\n'),
    message: 'ValueError: Invalid quantity',
    path: 'service/app/app/models.py',
    decoy: 'app/models.py',
    location: 'service/app/app/models.py:2',
    source: 'def parse(row):\n    return int(row["qty"])\n',
    line: 'return int(row["qty"])',
  },
]) {
  test(`an agent error from a ${example.name} uses the resolved workspace source`, async () => {
    const shop = join(fixture, 'Shop');
    await mkdir(dirname(join(shop, example.path)), { recursive: true });
    await mkdir(dirname(join(shop, example.decoy)), { recursive: true });
    await writeFile(join(shop, example.path), example.source);
    await writeFile(join(shop, example.decoy), '// Unrelated file\n// Unrelated line\n');

    // Emit Bash output through the Claude stream so it becomes a real agent error event.
    const sessionId = 'source-location-session';
    const lines = [
      { type: 'system', subtype: 'init', session_id: sessionId, claude_code_version: '2.1.322' },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'diagnostic',
              name: 'Bash',
              input: { command: example.command },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'diagnostic', content: example.output }],
        },
      },
      { type: 'result', subtype: 'success', is_error: false, session_id: sessionId },
    ];
    const stream = lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
    await writeFile(
      join(fixture, 'bin/node_modules/@anthropic-ai/claude-code/cli.js'),
      `if (process.argv.includes('--version')) console.log('2.1.322 (Claude Code)');
else process.stdin.once('data', () => process.stdout.write(${JSON.stringify(stream)}));\n`,
    );

    const timeline = await runTurn();
    await timeline.getByRole('button', { name: `Error · ${example.message}`, exact: true }).click();

    const inspector = page.getByRole('region', { name: 'Event inspector' });
    await inspector.getByRole('button', { name: 'Go to file' }).click({ timeout: 5_000 });
    const source = page.getByRole('dialog', { name: example.location, exact: true });
    await expect(source.locator('mark')).toHaveText(example.line);
    await page.keyboard.press('Escape');
    await expect(inspector).toContainText(example.location);
    await inspector.getByRole('button', { name: 'Ask Claude to fix' }).click();
    const draft = page.getByRole('textbox', { name: 'Message Claude' });
    await expect.poll(() => draft.inputValue()).toContain(`"path": "${example.path}"`);
    await inspector.getByRole('button', { name: 'Explain locally' }).click();
    await expect(inspector.getByRole('region', { name: 'Local explanation' })).toBeVisible();
    expect(ollamaRequests.at(-1)?.body).toMatchObject({
      messages: [
        { role: 'system' },
        { role: 'user', content: expect.stringContaining(example.path) },
      ],
    });
  });
}

test('Docker Compose logs and a real Vite dev server in the terminal reach the map and the timeline', async () => {
  const workspace = await realpath(join(fixture, 'Shop'));
  await mkdir(join(workspace, 'app'));
  await writeFile(
    join(workspace, 'app/models.py'),
    'def parse(row):\n    return int(row["qty"])\n',
  );
  // `docker compose logs api` of a container whose code is mounted at /app
  await writeFile(
    join(workspace, 'compose.log'),
    [
      'api-1  | INFO:     Started server process [1]',
      'api-1  | Traceback (most recent call last):',
      'api-1  |   File "/app/app/main.py", line 4, in <module>',
      'api-1  |     run()',
      'api-1  |   File "/app/app/models.py", line 2, in parse',
      'api-1  |     return int(row["qty"])',
      "api-1  | ValueError: invalid literal for int() with base 10: 'x'",
      'api-1 exited with code 1',
      '',
    ].join('\n'),
  );
  // a real Vite dev server (the repo's own) serving a module that does not compile
  await writeFile(
    join(workspace, 'index.html'),
    '<!doctype html><script type="module" src="/src/main.ts"></script>\n',
  );
  await writeFile(
    join(workspace, 'src/main.ts'),
    'const a: number = 1;\nexport function f() {\n  return a +;\n}\n',
  );
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  const timeline = await runTurn();
  const run = await openTerminal();
  const inspector = page.getByRole('region', { name: 'Event inspector' });

  await run('Get-Content compose.log', 'exited with code 1');
  // the container path /app/app/models.py is the workspace file app/models.py
  await expect(node('app/models.py')).toHaveAttribute('data-state', 'error', { timeout: 10_000 });
  const docker = timeline.getByRole('button', { name: /^Error · ValueError/ });
  await expect(docker).toHaveCount(1);
  await docker.click();
  await expect(inspector).toContainText('Docker · python');
  await timeline.getByRole('button', { name: 'Back to live' }).click();

  // Let Windows pick an available loopback port instead of sampling its reserved ranges.
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  probe.close();
  await once(probe, 'close');
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  const { port } = address;
  // The banner scrolls away under the dependency scan's error: wait for the server itself.
  await run(`node "${vite}" --host 127.0.0.1 --port ${port} --strictPort`, 'vite');
  // the browser asks for the module: Vite fails to transform it and prints the error
  await expect
    .poll(
      async () =>
        fetch(`http://127.0.0.1:${port}/src/main.ts`).then(
          (r) => r.status,
          () => 0,
        ),
      { timeout: 20_000 },
    )
    .toBe(500);
  await expect(node('src/main.ts')).toHaveAttribute('data-state', 'error', { timeout: 10_000 });
  await expect(node('src/main.ts')).toContainText('L3 PARSE_ERROR');
  const server = timeline.getByRole('button', { name: /^Error · PARSE_ERROR: Unexpected token/ });
  await server.last().click();
  await expect(inspector).toContainText('Dev server · node');
  await expect(inspector).toContainText('src/main.ts:3:13');
  await page.getByRole('region', { name: 'Terminal' }).locator('textarea').focus();
  await page.keyboard.press('Control+C');
});
