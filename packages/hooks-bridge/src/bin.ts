// The command Claude Code runs for every hook of a session the app started:
//
//   node <this file> <session folder>/bridge.json
//
// It reads the hook payload from stdin, validates it, and delivers it to the app's pipe with the
// session token. Once it runs, it exits 0 and prints nothing on stdout, whatever happens to the
// delivery, so a bridge problem never changes what the agent does; problems go to stderr as a
// short code, never with the token. (If Node itself cannot start the script, Node exits non-zero
// before any of this runs: Claude Code treats that as a non-blocking hook error.)
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
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

/**
 * The bridge file: an absolute path named `bridge.json`, a regular file (not a link) of at most
 * 4 KiB. It is opened once and checked through that handle, and the handle must be the file the
 * path named, so it cannot be swapped between the check and the read; at most 4 KiB + 1 bytes
 * are read, whatever the file claims its size is. The dev/ino comparison identifies the file on
 * local NTFS; on ReFS the 64-bit ID libuv exposes can match for distinct files (a 128-bit
 * FileIdInfo would need a native call): see docs/memoria/SICUREZZA.md.
 */
function readConfig(file: string | undefined) {
  if (!file || !isAbsolute(file) || basename(file) !== BRIDGE_FILE) return undefined;
  let fd: number | undefined;
  try {
    const named = lstatSync(file, { bigint: true });
    if (!named.isFile()) return undefined;
    fd = openSync(file, 'r');
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino) return undefined;
    if (opened.size > MAX_CONFIG_BYTES) return undefined;
    const buf = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    let length = 0;
    for (let n = 1; n > 0 && length < buf.length; length += n)
      n = readSync(fd, buf, length, buf.length - length, null);
    if (length > MAX_CONFIG_BYTES) return undefined;
    const parsed = bridgeConfigSchema.safeParse(JSON.parse(buf.toString('utf8', 0, length)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
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
