// The ESLint rules that keep every IPC channel inside @control-center/ipc-contract.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function restrictedImports(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('IPC import rules (eslint.config.mjs)', () => {
  it('forbids raw IPC modules in the main process outside src/main/ipc.ts', async () => {
    const code = "import { ipcMain } from 'electron';\nipcMain.handle('x', () => 1);\n";
    expect(await restrictedImports('apps/desktop/src/main/window.ts', code)).toHaveLength(1);
    expect(await restrictedImports('apps/desktop/src/main/ipc.ts', code)).toHaveLength(0);
  });

  it('forbids raw IPC modules in the preload outside src/preload/index.ts', async () => {
    const code = "import { ipcRenderer } from 'electron';\nvoid ipcRenderer;\n";
    expect(await restrictedImports('apps/desktop/src/preload/extra.ts', code)).toHaveLength(1);
    expect(await restrictedImports('apps/desktop/src/preload/index.ts', code)).toHaveLength(0);
  });

  it('forbids Electron, Node and the IPC internals in the renderer', async () => {
    const file = 'apps/desktop/src/renderer/src/Example.tsx';
    for (const code of [
      "import { shell } from 'electron';\nvoid shell;\n",
      "import { readFileSync } from 'node:fs';\nvoid readFileSync;\n",
      "import { createApi } from '@control-center/ipc-contract/preload';\nvoid createApi;\n",
    ]) {
      expect(await restrictedImports(file, code), code).toHaveLength(1);
    }
    const typesOnly =
      "import type { Api } from '@control-center/ipc-contract';\nexport type A = Api;\n";
    expect(await restrictedImports(file, typesOnly)).toHaveLength(0);
  });
});
