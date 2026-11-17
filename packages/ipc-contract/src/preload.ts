// Preload side of the contract: builds the object exposed as `window.api`.
//
// The API is generated from the contract, so the renderer can reach only contract channels,
// and it is deeply frozen. The preload passes in its own `invoke` (ipcRenderer.invoke): this
// module does not import Electron, and the raw ipcRenderer never reaches the renderer.
import { IpcEnvelopeSchema, IpcError, listMethods, type Api } from './contract';

export type RawInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/** Turns the main process envelope into a value or an IpcError. */
export function unwrapEnvelope(raw: unknown): unknown {
  const envelope = IpcEnvelopeSchema.safeParse(raw);
  if (!envelope.success) throw new IpcError('invalid-response', 'Malformed IPC envelope');
  if (!envelope.data.ok) throw new IpcError(envelope.data.error.code, envelope.data.error.message);
  return envelope.data.value;
}

export function createApi(invoke: RawInvoke): Api {
  const api: Record<string, Record<string, (request?: unknown) => Promise<unknown>>> = {};
  for (const [ns, name, spec] of listMethods()) {
    const methods = (api[ns] ??= {});
    const channel = spec.channel;
    methods[name] = async (...args: unknown[]) => {
      // Pass through exactly what the caller gave: the main process validates the arity too.
      const raw = await invoke(channel, ...args);
      return unwrapEnvelope(raw);
    };
  }
  for (const methods of Object.values(api)) Object.freeze(methods);
  return Object.freeze(api) as unknown as Api;
}
