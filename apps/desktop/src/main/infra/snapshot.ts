import { execFile } from 'node:child_process';
import { get, type RequestOptions } from 'node:http';
import { win32 } from 'node:path';
import { promisify } from 'node:util';
import { MachineSnapshotSchema, type MachineSnapshot } from '@control-center/ipc-contract';
import { z } from 'zod';

const execute = promisify(execFile);
const TIMEOUT_MS = 4000;
const MAX_BYTES = 1024 * 1024;
const CACHE_MS = 10_000;

const dockerContainers = z.array(z.object({ Id: z.string() }));
const ollamaProcesses = z.object({
  models: z
    .array(
      z.object({
        name: z.string().regex(/^[A-Za-z0-9_.:/-]{1,180}$/),
        size_vram: z.int().nonnegative(),
      }),
    )
    .max(128),
});

/** Fixed local endpoints only; no redirects, shared proxy or renderer-supplied input. */
function readJson(options: RequestOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(
      { ...options, agent: false, signal: AbortSignal.timeout(TIMEOUT_MS) },
      (response) => {
        response.once('error', reject);
        if (response.statusCode !== 200) {
          response.destroy();
          reject(new Error('Inventory endpoint unavailable'));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy(new Error('Inventory response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.once('error', reject);
  });
}

async function inspectDocker(): Promise<MachineSnapshot['docker']> {
  const data = await readJson({
    socketPath: '\\\\.\\pipe\\docker_engine',
    path: '/containers/json?all=0',
  });
  return { running: dockerContainers.parse(data).length };
}

const PORTS_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$tcp = @(Get-NetTCPConnection | Where-Object State -eq Listen)',
  '$ports = @($tcp | Select-Object -ExpandProperty LocalPort -Unique)',
  '$wild = @($tcp | Where-Object LocalAddress -in @("0.0.0.0", "::") | Select-Object -ExpandProperty LocalPort -Unique)',
  '@{ listening = $ports.Count; wildcard = $wild.Count } | ConvertTo-Json -Compress',
].join('\n');

async function inspectPorts(system32: string): Promise<MachineSnapshot['ports']> {
  const file = win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await execute(
    file,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PORTS_SCRIPT],
    { cwd: system32, windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES },
  );
  return MachineSnapshotSchema.shape.ports.parse(JSON.parse(stdout.trim()));
}

export function parseGpuMemory(stdout: string): NonNullable<MachineSnapshot['gpu']> {
  let usedMiB = 0;
  let totalMiB = 0;
  for (const line of stdout.trim().split(/\r?\n/)) {
    const row = /^(\d+),\s*(\d+)$/.exec(line.trim());
    if (!row) throw new Error('GPU memory is unavailable');
    usedMiB += Number(row[1]);
    totalMiB += Number(row[2]);
  }
  return { usedMiB, totalMiB };
}

async function inspectGpu(system32: string): Promise<MachineSnapshot['gpu']> {
  const { stdout } = await execute(
    win32.join(system32, 'nvidia-smi.exe'),
    ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'],
    { cwd: system32, windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES },
  );
  return MachineSnapshotSchema.shape.gpu.parse(parseGpuMemory(stdout));
}

async function inspectOllama(): Promise<MachineSnapshot['ollama']> {
  const data = await readJson({ hostname: '127.0.0.1', port: 11434, path: '/api/ps' });
  return {
    models: ollamaProcesses.parse(data).models.map(({ name, size_vram }) => ({
      name,
      inVram: size_vram > 0,
    })),
  };
}

function systemDirectory() {
  const root = process.env.SystemRoot;
  return root && /^[A-Z]:\\/i.test(root) ? win32.join(root, 'System32') : undefined;
}

async function collectMachineSnapshot(): Promise<MachineSnapshot> {
  const system32 = systemDirectory();
  const [docker, ports, gpu, ollama] = await Promise.all([
    inspectDocker().catch(() => null),
    system32 ? inspectPorts(system32).catch(() => null) : null,
    system32 ? inspectGpu(system32).catch(() => null) : null,
    inspectOllama().catch(() => null),
  ]);
  return { docker, ports, gpu, ollama };
}

/** Coalesce concurrent renderer calls and rate-limit local probes. */
export function createMachineSnapshotReader() {
  let cached: Promise<MachineSnapshot> | undefined;
  let expires = 0;
  return () => {
    const now = Date.now();
    if (!cached || now >= expires) {
      cached = collectMachineSnapshot();
      expires = now + CACHE_MS;
    }
    return cached;
  };
}
