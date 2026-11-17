// URL rules of the app: which pages the window may show and which links may leave the app.
// Pure functions (no Electron import), unit-tested in urls.test.ts.

/** Custom scheme that serves the packaged renderer (instead of file://). */
export const APP_SCHEME = 'app';
export const APP_HOST = 'control-center';
export const APP_INDEX_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

const MAX_URL_LENGTH = 2048;

function parse(raw: string): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * The dev server URL that electron-vite passes in development. Only loopback http URLs are
 * accepted, and the caller must ignore it in a packaged build.
 */
export function parseDevServerUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  const url = parse(raw);
  if (!url || url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
  return url;
}

/**
 * True when `raw` belongs to the app itself: the `app://control-center` origin, or the dev
 * server origin in development. Node's URL gives "null" as origin for custom schemes, so the
 * comparison is on protocol + host.
 */
export function isAppUrl(raw: string, devServer: URL | null = null): boolean {
  const url = parse(raw);
  if (!url || url.username || url.password) return false;
  if (url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST) return true;
  if (devServer && url.protocol === devServer.protocol && url.host === devServer.host) return true;
  return false;
}

/** Links that may be handed to the operating system browser: https only, no credentials. */
export function isSafeExternalUrl(raw: string): boolean {
  const url = parse(raw);
  if (!url) return false;
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return url.hostname.length > 0;
}
