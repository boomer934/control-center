import { stat } from 'node:fs/promises';
import { win32 } from 'node:path';
import type { TerminalShell } from '@control-center/ipc-contract/terminal';

function executableAt(root: string | undefined, ...segments: string[]): string[] {
  return root && win32.isAbsolute(root) ? [win32.join(root, ...segments)] : [];
}

/** The renderer selects a shell profile. Only the main process supplies executables and flags. */
export async function resolveShell(
  kind: TerminalShell,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ file: string; args: string[] } | null> {
  const powershell = kind === 'powershell';
  const candidates = powershell
    ? executableAt(env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : [
        ...executableAt(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
        ...executableAt(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
        ...executableAt(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
      ];
  for (const file of candidates) {
    if (
      await stat(file).then(
        (entry) => entry.isFile(),
        () => false,
      )
    ) {
      const args = powershell ? ['-NoLogo', '-NoProfile'] : ['--noprofile', '--norc', '-i'];
      return { file, args };
    }
  }
  return null;
}
