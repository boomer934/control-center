// Electron wiring of the security rules in ./security. Everything here is applied before the
// first window exists. See docs/memoria/SICUREZZA.md (Electron checklist).
import { pathToFileURL } from 'node:url';
import { net, protocol, shell, type App, type Session, type WebContents } from 'electron';
import { mimeTypeFor, resolveAssetPath } from './security/asset-path';
import { buildCsp } from './security/csp';
import {
  devicePermissionHandler,
  permissionCheckHandler,
  permissionRequestHandler,
} from './security/permissions';
import { APP_HOST, APP_SCHEME, isAppUrl, isSafeExternalUrl } from './security/urls';

/** Must run before `app.ready`: makes app:// a secure, standard scheme (own origin, fetch). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
};

/** Serves the built renderer from `rendererRoot` on app://control-center/, with the CSP header. */
export function installAppProtocol(session: Session, rendererRoot: string): void {
  const csp = buildCsp();
  session.protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const file = resolveAssetPath(rendererRoot, url.pathname);
    if (!file) return new Response('Not found', { status: 404 });

    const res = await net.fetch(pathToFileURL(file).toString());
    if (!res.ok) return new Response('Not found', { status: 404 });
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': mimeTypeFor(file),
        'Content-Security-Policy': csp,
        ...SECURITY_HEADERS,
      },
    });
  });
}

/** Session-wide rules: permissions denied, CSP on the dev server responses. */
export function hardenSession(session: Session, devServer: URL | null): void {
  session.setPermissionRequestHandler(permissionRequestHandler);
  session.setPermissionCheckHandler(permissionCheckHandler);
  session.setDevicePermissionHandler(devicePermissionHandler);

  if (devServer) {
    const csp = buildCsp({ devServerOrigin: devServer.origin });
    session.webRequest.onHeadersReceived({ urls: [`${devServer.origin}/*`] }, (details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
          'X-Content-Type-Options': ['nosniff'],
        },
      });
    });
  }
}

/** Opens a link in the system browser only if it is a plain https URL. */
export async function openExternalSafely(url: string): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  await shell.openExternal(url);
  return true;
}

/**
 * Rules for every WebContents the app ever creates: no new windows (https links go to the
 * system browser), no navigation away from the app, no <webview>.
 */
export function hardenAllWebContents(app: App, devServer: URL | null): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(({ url }) => {
      void openExternalSafely(url).catch(() => undefined);
      return { action: 'deny' };
    });

    const blockForeign = (event: { preventDefault(): void }, url: string) => {
      if (!isAppUrl(url, devServer)) event.preventDefault();
    };
    contents.on('will-navigate', blockForeign);
    contents.on('will-frame-navigate', (event) => blockForeign(event, event.url));
    contents.on('will-redirect', blockForeign);

    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
