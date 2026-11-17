// The command Claude Code runs for every hook of a session the app started:
//
//   node <this file> <session folder>/bridge.json
//
// It reads the hook payload from stdin, validates it, and delivers it to the app's pipe with the
// session token. It exits 0 and prints nothing on stdout, so a bridge problem never
// changes what the agent does; problems go to stderr as a short code, never with the token.
import { lstatSync, readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { sendHookEvent } from './client.ts';
import { BRIDGE_FILE, bridgeConfigSchema, hookPayloadSchema } from './protocol.ts';

/** Hook payloads can carry whole files (Read, Write): accept up to this much on stdin. */
const MAX_STDIN_BYTES = 16 * 1024 * 1024;
const MAX_CONFIG_BYTES = 4096;

const fail = (code: string): void => {
  process.stderr.write(`[control-center hooks-bridge] ${code}\n`);
};

async function readStdin(): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > MAX_STDIN_BYTES) return undefined;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function readConfig(file: string | undefined) {
  if (!file || !isAbsolute(file) || basename(file) !== BRIDGE_FILE) return undefined;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return undefined;
    const parsed = bridgeConfigSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const config = readConfig(process.argv[2]);
  if (!config) return fail('no-config');
  const input = await readStdin();
  if (input === undefined) return fail('input-too-large');
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch {
    return fail('input-not-json');
  }
  const payload = hookPayloadSchema.safeParse(json);
  if (!payload.success) return fail('input-invalid');
  const result = await sendHookEvent(config, payload.data);
  if (!result.ok) fail(result.code ?? 'refused');
}

// Let the process end by itself so stderr (asynchronous on a Windows pipe) is flushed; the
// client's own timeout bounds the wait, and this guard bounds everything else.
process.exitCode = 0;
setTimeout(() => process.exit(0), 10_000).unref();
main().catch(() => fail('internal'));
