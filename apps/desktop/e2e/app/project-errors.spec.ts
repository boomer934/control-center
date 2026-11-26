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
  ollama = createServer(async (request, response) => {
    let input = '';
    for await (const chunk of request) input += String(chunk);
    const body: unknown = input ? JSON.parse(input) : null;
    ollamaRequests.push({ path: request.url, body });
    const result =
      request.url === '/api/tags'
        ? {
            models: [
              { name: 'renamed:latest', size: 1, remote_model: 'hosted' },
              { name: 'remote:cloud', size: 2 },
              { name: 'opaque:latest', size: 3 },
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

test('a terminal error lights the culprit and offers all three actions before a session', async () => {
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

  await node('src/lib/price.js').click();
  const inspector = page.getByRole('region', { name: 'Event inspector' });
  const actions = inspector.getByRole('group', { name: 'Project error actions' });
  await expect(inspector).toContainText('src/lib/price.js:2:21');
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
    '/api/chat',
  ]);
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
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Session timeline' })
      .getByRole('button', { name: 'Turn completed', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
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

async function openTerminal() {
  await page.keyboard.press('Control+Backquote');
  const terminal = page.getByRole('region', { name: 'Terminal' });
  await terminal.getByRole('button', { name: 'PowerShell', exact: true }).click();
  await expect(terminal.locator('.xterm-rows')).toContainText('Shop', { timeout: 15_000 });
  await terminal.locator('textarea').focus();
  return async (command: string, done: string) => {
    await terminal.locator('textarea').focus();
    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
    await expect(terminal.locator('.xterm-rows')).toContainText(done, { timeout: 15_000 });
  };
}

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
  const port = 51_000 + Math.floor(Math.random() * 1000);
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

  // The banner scrolls away under the dependency scan's error: wait for the server itself.
  await run(`node "${vite}" --port ${port} --strictPort`, 'vite');
  // the browser asks for the module: Vite fails to transform it and prints the error
  await expect
    .poll(
      async () =>
        fetch(`http://localhost:${port}/src/main.ts`).then(
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
