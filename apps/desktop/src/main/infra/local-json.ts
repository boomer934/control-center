import { request, type RequestOptions } from 'node:http';

const MAX_BYTES = 1024 * 1024;

/** Direct connections only. Callers supply a fixed loopback address or a local socket. */
export function readJson(
  options: RequestOptions,
  signal: AbortSignal,
  body?: object,
): Promise<unknown> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        ...options,
        agent: false,
        signal,
        ...(payload !== undefined && {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        }),
      },
      (response) => {
        response.once('error', reject);
        if (response.statusCode !== 200) {
          response.destroy();
          reject(new Error('Local endpoint unavailable'));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy(new Error('Local response too large'));
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
    req.once('error', reject);
    req.end(payload);
  });
}
