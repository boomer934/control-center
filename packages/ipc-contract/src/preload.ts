// Preload side of the contract: builds the object exposed as `window.api`.
//
// The API is generated from the contract, so the renderer can reach only contract channels,
// and it is deeply frozen. The preload passes in its own `invoke` (ipcRenderer.invoke) and
// `subscribe` (ipcRenderer.on/removeListener): this module does not import Electron, and the raw
// ipcRenderer never reaches the renderer.
//
// Events (ADR 0007): `window.api.<ns>.onX(listener)` returns an unsubscribe function. One raw
// listener per channel fans out to the subscribers; the renderer gets only the validated payload,
// never the IpcRendererEvent (whose `sender` is ipcRenderer itself).
import {
  IpcEnvelopeSchema,
  IpcError,
  listEvents,
  listenerName,
  listMethods,
  type Api,
  type EventSpec,
  type Unsubscribe,
} from './contract';

export type RawInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/**
 * Attaches one raw listener to a channel. The listener receives the message arguments without
 * the IPC event object. Returns a function that detaches it.
 */
export type RawSubscribe = (channel: string, listener: (args: unknown[]) => void) => () => void;

export interface ApiOptions {
  /**
   * A subscriber threw: the other subscribers still got the event. For error reporting. Called
   * once per distinct error and channel: reporting may itself cause the next event (a throwing
   * `errors:changed` subscriber would otherwise feed itself).
   */
  onListenerError?(error: unknown, channel: string): void;
  /** A pushed message did not match the contract and was dropped. */
  onInvalidEvent?(channel: string): void;
}

/** Turns the main process envelope into a value or an IpcError. */
export function unwrapEnvelope(raw: unknown): unknown {
  const envelope = IpcEnvelopeSchema.safeParse(raw);
  if (!envelope.success) throw new IpcError('invalid-response', 'Malformed IPC envelope');
  if (!envelope.data.ok) throw new IpcError(envelope.data.error.code, envelope.data.error.message);
  return envelope.data.value;
}

type Listener = (payload: unknown) => void;

/** How many distinct listener errors are remembered per channel before reporting stops. */
const MAX_REPORTED_LISTENER_ERRORS = 50;

function errorKey(error: unknown): string {
  if (error instanceof Error)
    return `${error.name}
${error.message}`;
  return String(error);
}

function makeSubscriber(
  spec: EventSpec,
  subscribe: RawSubscribe,
  options: ApiOptions,
): (listener: Listener) => Unsubscribe {
  const { channel } = spec;
  const listeners = new Set<{ fn: Listener }>();
  const reported = new Set<string>();
  let detach: (() => void) | null = null;

  const reportListenerError = (error: unknown) => {
    const key = errorKey(error);
    if (reported.has(key) || reported.size >= MAX_REPORTED_LISTENER_ERRORS) return;
    reported.add(key);
    options.onListenerError?.(error, channel);
  };

  const dispatch = (args: unknown[]) => {
    const parsed = args.length === 1 ? spec.payload.safeParse(args[0]) : null;
    if (!parsed?.success) {
      options.onInvalidEvent?.(channel);
      return;
    }
    // A snapshot: a subscriber that unsubscribes (or subscribes) while we dispatch does not
    // change who receives this event.
    for (const entry of [...listeners]) {
      try {
        entry.fn(parsed.data);
      } catch (error) {
        reportListenerError(error);
      }
    }
  };

  return (listener) => {
    if (typeof listener !== 'function') {
      throw new TypeError(`${channel}: the listener must be a function`);
    }
    // One entry per call, so the same function subscribed twice is two subscriptions.
    const entry = { fn: listener };
    // Attach first: if it throws, no orphan entry is left behind.
    detach ??= subscribe(channel, dispatch);
    listeners.add(entry);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(entry);
      if (listeners.size === 0 && detach) {
        detach();
        detach = null;
      }
    };
  };
}

export function createApi(
  invoke: RawInvoke,
  subscribe: RawSubscribe,
  options: ApiOptions = {},
): Api {
  const api: Record<string, Record<string, (arg?: unknown) => unknown>> = {};
  for (const [ns, name, spec] of listMethods()) {
    const methods = (api[ns] ??= {});
    const channel = spec.channel;
    methods[name] = async (...args: unknown[]) => {
      // Pass through exactly what the caller gave: the main process validates the arity too.
      const raw = await invoke(channel, ...args);
      return unwrapEnvelope(raw);
    };
  }
  for (const [ns, name, spec] of listEvents()) {
    const members = (api[ns] ??= {});
    const subscriber = makeSubscriber(spec, subscribe, options);
    members[listenerName(name)] = (listener?: unknown) => subscriber(listener as Listener);
  }
  for (const members of Object.values(api)) Object.freeze(members);
  return Object.freeze(api) as unknown as Api;
}
