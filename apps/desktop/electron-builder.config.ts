// The unpacked build verifies Electron Fuses. The NSIS build also emits stable update metadata.
import type { Configuration } from 'electron-builder';
import release from '../../package.json';

const config: Configuration = {
  appId: 'dev.control-center.app',
  productName: 'Control Center',
  extraMetadata: { version: release.version },
  artifactName: 'Control-Center-Setup-${version}-${arch}.${ext}',
  publish: { provider: 'github', owner: 'boomer934', repo: 'control-center' },
  directories: { output: 'release', buildResources: 'build' },
  // The native terminal module and its worker need real filesystem paths.
  // Source maps stay inside the package: the Errors Console maps stacks to the TypeScript sources.
  files: ['out/**/*', 'package.json'],
  asar: true,
  // The project model worker thread runs from real files: its entry, the chunks it shares with
  // the main bundle, and the Tree-sitter runtime with its .wasm grammars (ADR 0012).
  asarUnpack: [
    '**/node_modules/node-pty/**/*',
    '**/node_modules/@vscode/tree-sitter-wasm/**/*',
    'out/main/project-worker.js',
    'out/main/chunks/**/*',
  ],
  npmRebuild: process.env.CC_USE_PREBUILT_PTY !== '1',
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
