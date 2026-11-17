// electron-builder configuration. Phase 3a only builds the unpacked app (`--dir`) to verify the
// Electron Fuses in e2e/packaged; installers, signing and updates come in phase 10.
import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'dev.control-center.app',
  productName: 'Control Center',
  directories: { output: 'release', buildResources: 'build' },
  // Everything is bundled by electron-vite into out/: no node_modules in the package.
  files: ['out/**/*', 'package.json', '!**/*.map'],
  asar: true,
  npmRebuild: false,
  // See docs/memoria/SICUREZZA.md (Electron checklist). Verified by e2e/packaged/fuses.spec.ts.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    enableCookieEncryption: true,
    grantFileProtocolExtraPrivileges: false,
    loadBrowserProcessSpecificV8Snapshot: false,
  },
  win: { target: [{ target: 'nsis', arch: ['x64'] }] },
};

export default config;
