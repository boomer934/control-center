// Electron checklist of docs/memoria/SICUREZZA.md, verified on the running app.
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { APP_DIR, launchApp } from '../launch';

let app: ElectronApplication;
let page: Page;
let profile: string | undefined;

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'cc-security-e2e-'));
  ({ app, page } = await launchApp({ userDataDir: profile }));
  // Record shell.openExternal calls instead of opening the system browser.
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __opened: string[] };
    g.__opened = [];
    shell.openExternal = async (url: string) => {
      g.__opened.push(url);
    };
  });
});

test.afterAll(async () => {
  await app?.close();
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3 });
});

const opened = () =>
  app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened.slice());
const windowCount = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

test.describe('startup', () => {
  test('the app starts, loads the renderer from app:// and talks to the main process', async () => {
    expect(page.url()).toBe('app://control-center/index.html');
    await expect(page.getByRole('heading', { name: 'Control Center' })).toBeVisible();
    const electron = await app.evaluate(() => process.versions.electron);
    await expect(page.getByTestId('electron-version')).toHaveText(electron);
  });

  test('runs the Electron version installed in node_modules', async () => {
    const pkg = JSON.parse(
      readFileSync(join(APP_DIR, 'node_modules/electron/package.json'), 'utf8'),
    ) as { version: string };
    expect(await app.evaluate(() => process.versions.electron)).toBe(pkg.version);
  });
});

test.describe('webPreferences', () => {
  test('contextIsolation, sandbox and webSecurity on; nodeIntegration and webview off', async () => {
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      // getLastWebPreferences() exists at runtime but is missing from Electron 45's typings.
      const wc = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
        getLastWebPreferences(): Electron.WebPreferences;
      };
      const p = wc.getLastWebPreferences();
      return {
        contextIsolation: p.contextIsolation,
        sandbox: p.sandbox,
        // eslint-disable-next-line no-restricted-properties -- read only, to assert it is off
        nodeIntegration: p.nodeIntegration,
        nodeIntegrationInWorker: p.nodeIntegrationInWorker,
        nodeIntegrationInSubFrames: p.nodeIntegrationInSubFrames,
        webSecurity: p.webSecurity,
        allowRunningInsecureContent: p.allowRunningInsecureContent,
        webviewTag: p.webviewTag,
      };
    });
    expect(prefs).toEqual({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  test('the renderer has no Node.js globals', async () => {
    const globals = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return ['require', 'process', 'module', 'Buffer', 'global', '__dirname'].filter(
        (k) => typeof w[k] !== 'undefined',
      );
    });
    expect(globals).toEqual([]);
  });
});

test.describe('preload', () => {
  test('exposes only the typed, frozen window.api', async () => {
    const shape = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const api = window.api as unknown as Record<string, Record<string, unknown>>;
      return {
        namespaces: Object.keys(api),
        methods: Object.fromEntries(Object.entries(api).map(([k, v]) => [k, Object.keys(v)])),
        types: Object.values(api).flatMap((ns) => Object.values(ns).map((f) => typeof f)),
        frozen: Object.isFrozen(api) && Object.values(api).every((ns) => Object.isFrozen(ns)),
        leaked: ['ipcRenderer', 'electron', 'contextBridge', 'webFrame'].filter(
          (k) => typeof w[k] !== 'undefined',
        ),
      };
    });
    expect(shape).toEqual({
      namespaces: [
        'app',
        'errors',
        'shell',
        'workspace',
        'terminal',
        'claude',
        'codex',
        'git',
        'project',
        'infra',
      ],
      methods: {
        app: ['getInfo'],
        errors: ['list', 'reportRenderer', 'copyReport', 'clear', 'onChanged'],
        shell: ['openExternal'],
        workspace: ['getState', 'chooseFolder', 'selectRecent', 'openFile', 'readSourceLocation'],
        terminal: ['start', 'write', 'resize', 'close', 'onUpdated'],
        claude: [
          'start',
          'send',
          'respond',
          'configure',
          'listHistory',
          'readHistory',
          'interrupt',
          'close',
          'onUpdated',
        ],
        codex: [
          'start',
          'send',
          'respond',
          'configure',
          'listHistory',
          'readHistory',
          'interrupt',
          'close',
          'onUpdated',
        ],
        git: ['status', 'diff', 'stage', 'commit', 'preview', 'restore'],
        project: ['open', 'onUpdated'],
        infra: ['snapshot', 'explainProjectError', 'cancelProjectErrorExplanation'],
      },
      types: Array.from({ length: 46 }, () => 'function'),
      frozen: true,
      leaked: [],
    });
  });

  test('window.api cannot be replaced or extended by the page', async () => {
    const result = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const before = w.api;
      try {
        w.api = { evil: true };
      } catch {
        /* non-writable */
      }
      try {
        (w.api as Record<string, unknown>).evil = () => 1;
      } catch {
        /* frozen */
      }
      return { same: w.api === before, evil: 'evil' in (w.api as object) };
    });
    expect(result).toEqual({ same: true, evil: false });
  });
});

test.describe('IPC gate', () => {
  test('invalid payloads are refused by the main process', async () => {
    const errors = await page.evaluate(async () => {
      const api = window.api as unknown as {
        shell: { openExternal: (...a: unknown[]) => Promise<unknown> };
        app: { getInfo: (...a: unknown[]) => Promise<unknown> };
      };
      const msg = (p: Promise<unknown>) =>
        p.then(
          () => 'resolved',
          (e: Error) => e.message,
        );
      return [
        await msg(api.shell.openExternal({ url: 42 })),
        await msg(api.shell.openExternal({ url: 'https://example.com', cmd: 'calc' })),
        await msg(api.shell.openExternal()),
        await msg(api.app.getInfo({ extra: true })),
      ];
    });
    for (const e of errors) expect(e).toContain('[invalid-request]');
  });

  test('a window the app did not create is an untrusted sender', async () => {
    // A second window with the same preload and URL, created behind the app's back.
    const [rogue, rogueId] = await Promise.all([
      app.waitForEvent('window'),
      app.evaluate(
        ({ BrowserWindow }, preload) => {
          const w = new BrowserWindow({
            show: false,
            webPreferences: { preload, sandbox: true, contextIsolation: true },
          });
          void w.loadURL('app://control-center/index.html');
          return w.id;
        },
        join(APP_DIR, 'out/preload/index.js'),
      ),
    ]);
    await rogue.waitForURL('app://control-center/index.html');
    // Hidden window: no requestAnimationFrame, so poll on a timer.
    await rogue.waitForFunction(() => 'api' in window, undefined, { polling: 100, timeout: 5000 });
    const result = await rogue.evaluate(() =>
      window.api.app.getInfo().then(
        () => 'resolved',
        (e: Error) => e.message,
      ),
    );
    expect(result).toContain('[untrusted-sender]');

    // Push events reach only the app's own windows: the rogue one subscribes but hears nothing.
    await rogue.evaluate(() => {
      const w = window as unknown as { __heard: number };
      w.__heard = 0;
      window.api.errors.onChanged(() => (w.__heard += 1));
    });
    const trustedHeard = page.evaluate(
      () =>
        new Promise<number>((done) => {
          const off = window.api.errors.onChanged(({ revision }) => {
            off();
            done(revision);
          });
        }),
    );
    await page.evaluate(() =>
      window.api.errors.reportRenderer({
        kind: 'window-error',
        name: 'Error',
        message: 'e2e push to trusted windows only',
        stack: '',
      }),
    );
    expect(await trustedHeard).toBeGreaterThan(0);
    expect(await rogue.evaluate(() => (window as unknown as { __heard: number }).__heard)).toBe(0);

    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), rogueId);
    expect(await windowCount()).toBe(1);
  });
});

test.describe('IPC events', () => {
  test('a pushed event carries only its validated payload', async () => {
    const received = page.evaluate(
      () =>
        new Promise<{ count: number; keys: string[]; revision: unknown }>((done) => {
          const off = window.api.errors.onChanged((...args: unknown[]) => {
            off();
            const payload = args[0] as Record<string, unknown>;
            done({ count: args.length, keys: Object.keys(payload), revision: payload.revision });
          });
        }),
    );
    await page.evaluate(() =>
      window.api.errors.reportRenderer({
        kind: 'window-error',
        name: 'Error',
        message: 'e2e push payload shape',
        stack: '',
      }),
    );
    const got = await received;
    expect(got.count).toBe(1);
    expect(got.keys).toEqual(['revision']);
    expect(typeof got.revision).toBe('number');
  });

  test('a subscription can be stopped, and a non-function listener is refused', async () => {
    const result = await page.evaluate(async () => {
      let heard = 0;
      const off = window.api.errors.onChanged(() => (heard += 1));
      off();
      off();
      // A second subscriber that stays: once it hears the event, the removed one would have too.
      const delivered = new Promise<void>((done) => {
        const stay = window.api.errors.onChanged(() => {
          stay();
          done();
        });
      });
      await window.api.errors.reportRenderer({
        kind: 'window-error',
        name: 'Error',
        message: 'e2e push after unsubscribe',
        stack: '',
      });
      await delivered;
      let refused = '';
      try {
        (window.api.errors.onChanged as (l: unknown) => unknown)('not a function');
      } catch (e) {
        refused = (e as Error).message;
      }
      return { heard, refused };
    });
    expect(result.heard).toBe(0);
    expect(result.refused).toContain('listener must be a function');
  });
});

test.describe('Content-Security-Policy', () => {
  test('is sent as a header and as a meta tag, without unsafe-eval or remote sources', async () => {
    const { header, meta } = await page.evaluate(async () => {
      const res = await fetch('app://control-center/index.html');
      return {
        header: res.headers.get('content-security-policy') ?? '',
        meta:
          document
            .querySelector('meta[http-equiv="Content-Security-Policy"]')
            ?.getAttribute('content') ?? '',
      };
    });
    for (const csp of [header, meta]) {
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toMatch(/https?:|\*/);
    }
    expect(header).toContain("frame-ancestors 'none'");
  });

  test('blocks eval, new Function, inline scripts and remote scripts', async () => {
    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(e.effectiveDirective),
      );
      const w = window as unknown as Record<string, unknown>;
      // DevTools lets code evaluated by Playwright itself use eval: the checks run in a timer
      // callback, outside that evaluation, like any script of the page.
      const deferred = <T>(fn: () => T) =>
        new Promise<T>((resolve) => setTimeout(() => resolve(fn()), 0));
      const evalBlocked = await deferred(() => {
        try {
          // eslint-disable-next-line no-eval
          eval('1 + 1');
          return false;
        } catch {
          return true;
        }
      });
      const fnBlocked = await deferred(() => {
        try {
          // eslint-disable-next-line no-new-func
          new Function('return 1')();
          return false;
        } catch {
          return true;
        }
      });
      // A string timer is eval in disguise.
      (setTimeout as unknown as (code: string, ms: number) => void)('window.__timerRan = true', 0);
      const inline = document.createElement('script');
      inline.textContent = 'window.__inlineRan = true';
      document.body.append(inline);
      const remote = document.createElement('script');
      remote.src = 'https://example.com/x.js';
      document.body.append(remote);
      await new Promise((r) => setTimeout(r, 300));
      return {
        evalBlocked,
        fnBlocked,
        timerRan: w.__timerRan === true,
        inlineRan: w.__inlineRan === true,
        violations,
      };
    });
    expect(result.evalBlocked).toBe(true);
    expect(result.fnBlocked).toBe(true);
    expect(result.timerRan).toBe(false);
    expect(result.inlineRan).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining(['script-src-elem']));
  });

  test('blocks remote fetches and frames', async () => {
    const result = await page.evaluate(async () => {
      const fetchBlocked = await fetch('https://example.com/').then(
        () => false,
        () => true,
      );
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(e.effectiveDirective),
      );
      const frame = document.createElement('iframe');
      frame.src = 'https://example.com/';
      document.body.append(frame);
      await new Promise((r) => setTimeout(r, 300));
      frame.remove();
      return { fetchBlocked, violations };
    });
    expect(result.fetchBlocked).toBe(true);
    expect(result.violations).toContain('frame-src');
  });
});

test.describe('app:// protocol', () => {
  test('serves only files of the built renderer', async () => {
    const statuses = await page.evaluate(async () => {
      const urls = [
        'app://control-center/index.html',
        'app://control-center/%2e%2e/main/index.js',
        'app://control-center/..%2f..%2fpackage.json',
        'app://control-center/..%5c..%5cpackage.json',
        'app://control-center/assets/%00.js',
        'app://control-center/missing.js',
        'app://other-host/index.html',
      ];
      const out: Record<string, number> = {};
      for (const u of urls)
        out[u] = await fetch(u).then(
          (r) => r.status,
          () => -1,
        );
      return out;
    });
    const { ['app://control-center/index.html']: ok, ...rest } = statuses;
    expect(ok).toBe(200);
    for (const [url, status] of Object.entries(rest)) {
      expect(status, url).not.toBe(200);
    }
  });
});

test.describe('navigation and new windows', () => {
  test('window.open is denied; https links go to the system browser, others nowhere', async () => {
    const results = await page.evaluate(() =>
      [
        'https://example.com/docs',
        'http://example.com/',
        'file:///C:/Windows/System32/calc.exe',
        'javascript:alert(1)',
        'https://user:pass@example.com/',
      ].map((u) => window.open(u) === null),
    );
    expect(results).toEqual([true, true, true, true, true]);
    await expect.poll(opened).toEqual(['https://example.com/docs']);
    expect(await windowCount()).toBe(1);
  });

  test('target=_blank links behave like window.open', async () => {
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = 'https://example.com/blank';
      a.target = '_blank';
      a.textContent = 'external';
      a.id = 'ext-link';
      document.body.append(a);
    });
    await page.click('#ext-link');
    await expect.poll(opened).toContain('https://example.com/blank');
    expect(await windowCount()).toBe(1);
    await page.evaluate(() => document.getElementById('ext-link')?.remove());
  });

  test('navigation away from the app is blocked', async () => {
    const mainFrameUrl = () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getURL());
    for (const target of ['https://example.com/', 'file:///C:/', 'http://localhost:1/']) {
      await page.evaluate((u) => {
        window.location.href = u;
      }, target);
      await page.waitForTimeout(300);
      // Ask the main process: Playwright keeps waiting for the cancelled navigation.
      expect(await mainFrameUrl(), target).toBe('app://control-center/index.html');
    }
    const stillTheApp = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(
        "document.querySelector('[data-testid=app-info]') !== null",
      ),
    );
    expect(stillTheApp).toBe(true);
  });
});

test.describe('web permissions', () => {
  test('notifications, geolocation, camera and microphone are denied', async () => {
    const result = await page.evaluate(async () => {
      const notification = await Notification.requestPermission();
      const query = async (name: string) =>
        (await navigator.permissions.query({ name } as PermissionDescriptor)).state;
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(
        () => 'granted',
        (e: Error) => e.name,
      );
      const geo = await new Promise<string>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          (e) => resolve(e.code === e.PERMISSION_DENIED ? 'denied' : `error-${e.code}`),
        ),
      );
      return {
        notification,
        notificationsQuery: await query('notifications'),
        geolocationQuery: await query('geolocation'),
        cameraQuery: await query('camera'),
        media,
        geo,
      };
    });
    expect(result).toEqual({
      notification: 'denied',
      notificationsQuery: 'denied',
      geolocationQuery: 'denied',
      cameraQuery: 'denied',
      media: 'NotAllowedError',
      geo: 'denied',
    });
  });
});
