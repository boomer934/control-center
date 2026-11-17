import { spawn } from 'node:child_process';
import { win32 } from 'node:path';

/** Opens a validated path as text. Shell file associations can execute the target. */
export function openInEditor(file: string): Promise<boolean> {
  const root = process.env.SystemRoot;
  if (!root || !win32.isAbsolute(root)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const editor = spawn(win32.join(root, 'System32', 'notepad.exe'), [file], {
      shell: false,
      stdio: 'ignore',
      cwd: win32.join(root, 'System32'),
    });
    editor.once('error', () => resolve(false));
    editor.once('spawn', () => {
      editor.unref();
      resolve(true);
    });
  });
}
