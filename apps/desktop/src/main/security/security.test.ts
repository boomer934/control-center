import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mimeTypeFor, resolveAssetPath } from './asset-path';
import { buildCsp } from './csp';
import {
  ALLOWED_PERMISSIONS,
  devicePermissionHandler,
  permissionCheckHandler,
  permissionRequestHandler,
} from './permissions';
import { APP_INDEX_URL, isAppUrl, isSafeExternalUrl, parseDevServerUrl } from './urls';
import { secureWebPreferences } from './web-preferences';

describe('secureWebPreferences', () => {
  it('turns on isolation, sandbox and web security and turns off Node', () => {
    const prefs = secureWebPreferences('/app/out/preload/index.js');
    expect(prefs).toMatchObject({
      preload: '/app/out/preload/index.js',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      experimentalFeatures: false,
    });
  });

  it('sets no option that loosens security', () => {
    const prefs = secureWebPreferences('p') as Record<string, unknown>;
    expect(prefs.enableBlinkFeatures).toBeUndefined();
    expect(prefs.additionalArguments).toBeUndefined();
    expect(prefs.disableBlinkFeatures).toBeUndefined();
  });
});

describe('buildCsp', () => {
  const directives = (csp: string) =>
    new Map(
      csp.split(';').map((d) => {
        const [name = '', ...values] = d.trim().split(/\s+/);
        return [name, values];
      }),
    );

  it('production: same-origin only, no inline script, no eval, no remote sources', () => {
    const csp = buildCsp();
    const d = directives(csp);
    expect(d.get('default-src')).toEqual(["'none'"]);
    expect(d.get('script-src')).toEqual(["'self'"]);
    expect(d.get('style-src')).toEqual(["'self'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('frame-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'none'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|wasm-unsafe-eval|https?:|ws:|\*/);
  });

  it('meta variant leaves out frame-ancestors (ignored in <meta>)', () => {
    expect(buildCsp({ meta: true })).not.toContain('frame-ancestors');
  });

  it('dev: allows the loopback dev server websocket and inline preamble, never eval', () => {
    const csp = buildCsp({ devServerOrigin: 'http://localhost:5173' });
    const d = directives(csp);
    expect(d.get('connect-src')).toEqual(["'self'", 'ws://localhost:5173']);
    expect(d.get('script-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('https:');
  });
});

describe('URL rules', () => {
  it('accepts only loopback http dev servers', () => {
    expect(parseDevServerUrl('http://localhost:5173/')?.host).toBe('localhost:5173');
    expect(parseDevServerUrl('http://127.0.0.1:5173')).not.toBeNull();
    for (const bad of [
      undefined,
      '',
      'https://localhost:5173',
      'http://192.168.1.10:5173',
      'http://evil.example',
      'http://user:pw@localhost:5173',
      'file:///C:/index.html',
      'not a url',
    ]) {
      expect(parseDevServerUrl(bad), String(bad)).toBeNull();
    }
  });

  it('recognises the app origin and, in dev, the dev server origin', () => {
    const dev = parseDevServerUrl('http://localhost:5173');
    expect(isAppUrl(APP_INDEX_URL)).toBe(true);
    expect(isAppUrl('app://control-center/assets/x.js')).toBe(true);
    expect(isAppUrl('http://localhost:5173/', dev)).toBe(true);
    expect(isAppUrl('http://localhost:5173/')).toBe(false);
    for (const bad of [
      'app://other/index.html',
      'app://user@control-center/',
      'http://localhost:5174/',
      'https://control-center/',
      'file:///C:/control-center/index.html',
      'about:blank',
      '',
    ]) {
      expect(isAppUrl(bad, dev), bad).toBe(false);
    }
  });

  it('lets only plain https links leave the app', () => {
    expect(isSafeExternalUrl('https://github.com/anthropics')).toBe(true);
    for (const bad of [
      'http://example.com',
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-settings:privacy',
      'smb://server/share',
      'https://user:pass@example.com',
      'data:text/html,<script>1</script>',
      `https://example.com/${'a'.repeat(3000)}`,
      'https:',
      '',
    ]) {
      expect(isSafeExternalUrl(bad), bad).toBe(false);
    }
  });
});

describe('web permissions', () => {
  it('grants nothing by default', () => {
    expect(ALLOWED_PERMISSIONS.size).toBe(0);
    for (const p of [
      'media',
      'notifications',
      'geolocation',
      'clipboard-read',
      'clipboard-sanitized-write',
      'midi',
      'openExternal',
      'fullscreen',
      'pointerLock',
      'hid',
      'serial',
      'usb',
    ]) {
      const cb = vi.fn();
      permissionRequestHandler(null, p, cb);
      expect(cb, p).toHaveBeenCalledWith(false);
      expect(permissionCheckHandler(null, p), p).toBe(false);
    }
    expect(devicePermissionHandler()).toBe(false);
  });
});

describe('resolveAssetPath', () => {
  const root = mkdtempSync(join(tmpdir(), 'cc-assets-'));
  mkdirSync(join(root, 'renderer', 'assets'), { recursive: true });
  writeFileSync(join(root, 'renderer', 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'renderer', 'assets', 'a.js'), '');
  writeFileSync(join(root, 'secret.txt'), 'secret');
  const renderer = join(root, 'renderer');
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('maps / and real files inside the root', () => {
    expect(resolveAssetPath(renderer, '/')).toBe(resolve(renderer, 'index.html'));
    expect(resolveAssetPath(renderer, '/index.html')).toBe(resolve(renderer, 'index.html'));
    expect(resolveAssetPath(renderer, '/assets/a.js')).toBe(resolve(renderer, 'assets/a.js'));
  });

  it.each([
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/..%5csecret.txt',
    '/assets/../../secret.txt',
    '/%2e%2e%2f%2e%2e%2fWindows',
    '/C:/Windows/win.ini',
    '/%00index.html',
    '/%E0%A4%A',
    '/missing.js',
    '/assets',
  ])('refuses %s', (p) => {
    expect(resolveAssetPath(renderer, p)).toBeNull();
  });

  it('refuses a link inside the root that points outside it', () => {
    const fakeFs = {
      realpath: (p: string) => (p.endsWith('evil.js') ? join(root, 'secret.txt') : resolve(p)),
      isFile: () => true,
    };
    expect(resolveAssetPath(renderer, '/assets/evil.js', fakeFs)).toBeNull();
    expect(resolveAssetPath(renderer, '/assets/a.js', fakeFs)).not.toBeNull();
  });

  it('gives known MIME types and a safe default', () => {
    expect(mimeTypeFor('x/index.html')).toBe('text/html; charset=utf-8');
    expect(mimeTypeFor('x/a.JS')).toBe('text/javascript; charset=utf-8');
    expect(mimeTypeFor('x/a.exe')).toBe('application/octet-stream');
  });
});
