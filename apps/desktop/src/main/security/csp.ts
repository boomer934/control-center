// Content-Security-Policy of the renderer. One source of truth for the HTTP header (app://
// protocol and dev server) and for the <meta> tag that the build adds to index.html.

export interface CspOptions {
  /** Origin of the electron-vite dev server; undefined in production. */
  readonly devServerOrigin?: string;
  /** The <meta> variant: directives that browsers ignore in a meta tag are left out. */
  readonly meta?: boolean;
}

/**
 * Production: everything from the app origin only, no inline scripts, no eval, no remote sources.
 * Development additionally allows what Vite needs: the React Refresh inline preamble, injected
 * <style> tags and the HMR websocket on the loopback dev server. Never `unsafe-eval`.
 */
export function buildCsp(options: CspOptions = {}): string {
  const dev = options.devServerOrigin;
  const ws = dev ? dev.replace(/^http:/, 'ws:') : undefined;

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'none'"]],
    ['script-src', dev ? ["'self'", "'unsafe-inline'"] : ["'self'"]],
    ['style-src', dev ? ["'self'", "'unsafe-inline'"] : ["'self'"]],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', ws ? ["'self'", ws] : ["'self'"]],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'none'"]],
    ['media-src', ["'none'"]],
    ['object-src', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['child-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'none'"]],
  ];
  if (!options.meta) directives.push(['frame-ancestors', ["'none'"]]);

  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
