// Helpers for the project model tests: temporary workspaces written from a file map.
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const WASM_DIR = dirname(createRequire(import.meta.url).resolve('@vscode/tree-sitter-wasm'));

export async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

export async function tempWorkspace(files: Record<string, string> = {}): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cc-project-model-')));
  await writeTree(root, files);
  return root;
}

export const removeWorkspace = (root: string) =>
  rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
