import type { WebPreferences } from 'electron';

/**
 * The only webPreferences a Control Center window is created with. Never spread user or
 * renderer-provided options into it. See docs/memoria/SICUREZZA.md (Electron checklist).
 */
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    sandbox: true,

    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    experimentalFeatures: false,
    navigateOnDragDrop: false,
    spellcheck: false,
    safeDialogs: true,
  };
}
