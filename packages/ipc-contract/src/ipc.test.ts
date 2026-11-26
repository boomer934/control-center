import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  contract,
  IpcError,
  listChannels,
  listEvents,
  listMethods,
  type AppInfo,
  type EventSpec,
  type Handlers,
} from './index';
import {
  createEventEmitter,
  registerIpcHandlers,
  type EventReceiver,
  type IpcMainLike,
  type IpcSenderEvent,
} from './main';
import { createApi, unwrapEnvelope, type RawSubscribe } from './preload';

type Listener = (event: IpcSenderEvent, ...args: unknown[]) => unknown;

class FakeIpcMain implements IpcMainLike<IpcSenderEvent> {
  readonly listeners = new Map<string, Listener>();
  handle(channel: string, listener: Listener): void {
    if (this.listeners.has(channel)) throw new Error(`duplicate ${channel}`);
    this.listeners.set(channel, listener);
  }
  removeHandler(channel: string): void {
    this.listeners.delete(channel);
  }
  call(channel: string, event: IpcSenderEvent, ...args: unknown[]): Promise<unknown> {
    const l = this.listeners.get(channel);
    if (!l) return Promise.reject(new Error(`No handler registered for '${channel}'`));
    return Promise.resolve(l(event, ...args));
  }
}

const APP_URL = 'app://control-center/index.html';
const trusted: IpcSenderEvent = { senderFrame: { url: APP_URL } };
const isTrustedSender = (e: IpcSenderEvent) =>
  e.senderFrame?.url.startsWith('app://control-center/') ?? false;

const info: AppInfo = {
  name: 'Control Center',
  version: '0.0.0',
  electron: '45.0.0',
  chrome: '140.0.0.0',
  node: '24.0.0',
  platform: 'win32',
  packaged: false,
};

const noSubscribe: RawSubscribe = () => () => {};

const errorsStub: Handlers['errors'] = {
  list: () => ({ revision: 0, groups: [] }),
  reportRenderer: () => ({ id: 'abc' }),
  copyReport: () => ({ copied: true, groups: 0 }),
  clear: () => ({ cleared: 0 }),
};

function makeHandlers(overrides: Partial<{ getInfo: unknown; openExternal: unknown }> = {}) {
  const getInfo = vi.fn(() => (overrides.getInfo ?? info) as AppInfo);
  const openExternal = vi.fn(({ url }: { url: string }) => ({ opened: url.startsWith('https:') }));
  const handlers: Handlers = {
    app: { getInfo },
    errors: errorsStub,
    shell: { openExternal },
    workspace: {
      getState: () => ({ active: null, recent: [] }),
      chooseFolder: () => null,
      selectRecent: () => null,
      openFile: () => false,
    },
    terminal: {
      start: () => 'workspace-unavailable',
      write: () => false,
      resize: () => false,
      close: () => false,
    },
    claude: {
      start: () => 'workspace-unavailable',
      send: () => 'closed',
      respond: () => false,
      listHistory: () => [],
      readHistory: () => null,
      interrupt: () => false,
      close: () => false,
    },
    git: {
      status: () => ({ ok: false, error: 'workspace-unavailable' }),
      diff: () => ({ ok: false, error: 'workspace-unavailable' }),
      stage: () => ({ ok: false, error: 'workspace-unavailable' }),
      commit: () => ({ ok: false, error: 'workspace-unavailable' }),
      preview: () => ({ ok: false, error: 'workspace-unavailable' }),
      restore: () => ({ ok: false, error: 'workspace-unavailable' }),
    },
    project: {
      open: () => ({ ok: false, error: 'workspace-unavailable' }),
    },
    infra: { snapshot: () => ({ docker: null, ports: null, gpu: null, ollama: null }) },
  };
  return { handlers, getInfo, openExternal };
}

function setup(overrides?: Parameters<typeof makeHandlers>[0]) {
  const ipc = new FakeIpcMain();
  const h = makeHandlers(overrides);
  const onFailure = vi.fn();
  const dispose = registerIpcHandlers(ipc, h.handlers, { isTrustedSender, onFailure });
  return { ipc, ...h, onFailure, dispose };
}

describe('contract', () => {
  it('declares exactly the reviewed channels (adding one must update this test)', () => {
    expect(listChannels()).toEqual([
      'app:get-info',
      'errors:list',
      'errors:report-renderer',
      'errors:copy-report',
      'errors:clear',
      'errors:changed',
      'shell:open-external',
      'workspace:get-state',
      'workspace:choose-folder',
      'workspace:select-recent',
      'workspace:open-file',
      'terminal:start',
      'terminal:write',
      'terminal:resize',
      'terminal:close',
      'terminal:updated',
      'claude:start',
      'claude:send',
      'claude:respond',
      'claude:list-history',
      'claude:read-history',
      'claude:interrupt',
      'claude:close',
      'claude:updated',
      'git:status',
      'git:diff',
      'git:stage',
      'git:commit',
      'git:preview',
      'git:restore',
      'project:open',
      'project:updated',
      'infra:snapshot',
    ]);
    expect(listEvents().map(([, , spec]) => spec.channel)).toEqual([
      'errors:changed',
      'terminal:updated',
      'claude:updated',
      'project:updated',
    ]);
    expect(listMethods()).toHaveLength(listChannels().length - listEvents().length);
  });

  it('has no generic or command-like channel', () => {
    for (const channel of listChannels()) {
      expect(channel).not.toMatch(/exec|eval|spawn|command|run|invoke|any|generic|raw/i);
    }
  });

  it('has unique channel names', () => {
    const channels = listChannels();
    expect(new Set(channels).size).toBe(channels.length);
  });

  it('rejects unknown keys in requests (strict schemas)', () => {
    const r = contract.shell.openExternal.request.safeParse({ url: 'https://x.dev', extra: 1 });
    expect(r.success).toBe(false);
  });
});

describe('registerIpcHandlers (main)', () => {
  it('registers one handler per contract channel and nothing else', () => {
    const { ipc } = setup();
    const methods = listMethods().map(([, , spec]) => spec.channel);
    expect([...ipc.listeners.keys()].sort()).toEqual(methods.sort());
    // events are main → renderer only: nothing answers on their channel
    expect(ipc.listeners.has('errors:changed')).toBe(false);
  });

  it('answers a trusted, valid call with an ok envelope', async () => {
    const { ipc, getInfo } = setup();
    await expect(ipc.call('app:get-info', trusted)).resolves.toEqual({ ok: true, value: info });
    expect(getInfo).toHaveBeenCalledWith(undefined, { senderUrl: APP_URL });
  });

  it.each([
    ['foreign origin', { senderFrame: { url: 'https://evil.example/' } }],
    ['missing frame', { senderFrame: null }],
    ['no frame field', {}],
  ])('refuses an untrusted sender (%s) without calling the handler', async (_, event) => {
    const { ipc, getInfo, onFailure } = setup();
    const res = await ipc.call('app:get-info', event as IpcSenderEvent);
    expect(res).toMatchObject({ ok: false, error: { code: 'untrusted-sender' } });
    expect(getInfo).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'app:get-info', code: 'untrusted-sender' }),
    );
  });

  it('refuses the call when the sender check itself throws', async () => {
    const ipc = new FakeIpcMain();
    const { handlers, getInfo } = makeHandlers();
    registerIpcHandlers(ipc, handlers, {
      isTrustedSender: () => {
        throw new Error('boom');
      },
    });
    const res = await ipc.call('app:get-info', trusted);
    expect(res).toMatchObject({ ok: false, error: { code: 'untrusted-sender' } });
    expect(getInfo).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong type', [{ url: 42 }]],
    ['unknown key', [{ url: 'https://x.dev', cmd: 'calc.exe' }]],
    ['missing payload', []],
    ['too long', [{ url: `https://x.dev/${'a'.repeat(3000)}` }]],
    ['too many arguments', [{ url: 'https://x.dev' }, 'extra']],
  ])('refuses an invalid request (%s) without calling the handler', async (_, args) => {
    const { ipc, openExternal } = setup();
    const res = await ipc.call('shell:open-external', trusted, ...args);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('refuses a payload on a method that takes none', async () => {
    const { ipc, getInfo } = setup();
    const res = await ipc.call('app:get-info', trusted, { sneaky: true });
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(getInfo).not.toHaveBeenCalled();
  });

  it('refuses renderer-supplied probe parameters for the machine inventory', async () => {
    const { ipc } = setup();
    const res = await ipc.call('infra:snapshot', trusted, { host: 'https://example.invalid' });
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('never echoes received values in validation messages', async () => {
    const { ipc } = setup();
    const res = (await ipc.call('shell:open-external', trusted, { url: 999_111_333 })) as {
      error: { message: string };
    };
    expect(res.error.message).not.toContain('999111333');
  });

  it('hides handler errors behind a generic message', async () => {
    const ipc = new FakeIpcMain();
    const onFailure = vi.fn();
    const secretPath = 'C:\\Users\\someone\\secret.txt';
    registerIpcHandlers(
      ipc,
      {
        ...makeHandlers().handlers,
        app: {
          getInfo: () => {
            throw new Error(`cannot read ${secretPath}`);
          },
        },
        shell: { openExternal: () => ({ opened: false }) },
      },
      { isTrustedSender, onFailure },
    );
    const res = await ipc.call('app:get-info', trusted);
    expect(res).toEqual({
      ok: false,
      error: { code: 'handler-failed', message: 'Request failed' },
    });
    expect(JSON.stringify(res)).not.toContain('secret');
    expect(onFailure.mock.calls[0]?.[0].cause).toBeInstanceOf(Error);
  });

  it('bounds and validates what the renderer may report about its own errors', async () => {
    const { ipc } = setup();
    const ok = { kind: 'window-error', name: 'Error', message: 'x', stack: 'at y' };
    await expect(ipc.call('errors:report-renderer', trusted, ok)).resolves.toEqual({
      ok: true,
      value: { id: 'abc' },
    });
    for (const bad of [
      { ...ok, kind: 'uncaught-exception' },
      { ...ok, stack: 'x'.repeat(20_001) },
      { ...ok, extra: 1 },
      { kind: 'window-error' },
    ]) {
      const res = await ipc.call('errors:report-renderer', trusted, bad);
      expect(res).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
  });

  it('refuses a handler response that does not match the schema', async () => {
    const { ipc } = setup({ getInfo: { ...info, token: 'leaked' } });
    const res = await ipc.call('app:get-info', trusted);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-response' } });
    expect(JSON.stringify(res)).not.toContain('leaked');
  });

  it('throws when a handler is missing', () => {
    const ipc = new FakeIpcMain();
    const { handlers } = makeHandlers();
    const broken = { ...handlers, shell: {} } as unknown as Handlers;
    expect(() => registerIpcHandlers(ipc, broken, { isTrustedSender })).toThrow(
      /shell:open-external/,
    );
  });

  it('removes every handler on dispose', () => {
    const { ipc, dispose } = setup();
    dispose();
    expect(ipc.listeners.size).toBe(0);
  });
});

describe('createApi (preload)', () => {
  it('exposes exactly the contract methods, deeply frozen', () => {
    const api = createApi(async () => ({ ok: true, value: null }), noSubscribe);
    expect(Object.keys(api)).toEqual([
      'app',
      'errors',
      'shell',
      'workspace',
      'terminal',
      'claude',
      'git',
      'project',
      'infra',
    ]);
    expect(Object.keys(api.infra)).toEqual(['snapshot']);
    expect(Object.keys(api.project)).toEqual(['open', 'onUpdated']);
    expect(Object.keys(api.git)).toEqual([
      'status',
      'diff',
      'stage',
      'commit',
      'preview',
      'restore',
    ]);
    expect(Object.keys(api.app)).toEqual(['getInfo']);
    expect(Object.keys(api.errors)).toEqual([
      'list',
      'reportRenderer',
      'copyReport',
      'clear',
      'onChanged',
    ]);
    expect(Object.keys(api.shell)).toEqual(['openExternal']);
    expect(Object.keys(api.workspace)).toEqual([
      'getState',
      'chooseFolder',
      'selectRecent',
      'openFile',
    ]);
    expect(Object.keys(api.terminal)).toEqual(['start', 'write', 'resize', 'close', 'onUpdated']);
    expect(Object.keys(api.claude)).toEqual([
      'start',
      'send',
      'respond',
      'listHistory',
      'readHistory',
      'interrupt',
      'close',
      'onUpdated',
    ]);
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.app)).toBe(true);
    expect(Object.isFrozen(api.shell)).toBe(true);
  });

  it('sends on the contract channel and unwraps the value', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: { opened: true } }));
    const api = createApi(invoke, noSubscribe);
    await expect(api.shell.openExternal({ url: 'https://x.dev' })).resolves.toEqual({
      opened: true,
    });
    expect(invoke).toHaveBeenCalledWith('shell:open-external', { url: 'https://x.dev' });
  });

  it('turns an error envelope into an IpcError', async () => {
    const api = createApi(
      async () => ({
        ok: false,
        error: { code: 'untrusted-sender', message: 'Sender not allowed' },
      }),
      noSubscribe,
    );
    const err = await api.app.getInfo().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IpcError);
    expect((err as IpcError).code).toBe('untrusted-sender');
  });

  it('rejects a malformed envelope', () => {
    expect(() => unwrapEnvelope({ value: 1 })).toThrow(IpcError);
    expect(() => unwrapEnvelope('ok')).toThrow(IpcError);
  });

  it('works end to end against the main-side gate', async () => {
    const { ipc } = setup();
    const api = createApi((channel, ...args) => ipc.call(channel, trusted, ...args), noSubscribe);
    await expect(api.app.getInfo()).resolves.toEqual(info);
    await expect(api.shell.openExternal({ url: 'https://x.dev' })).resolves.toEqual({
      opened: true,
    });
    await expect(
      // @ts-expect-error: the types forbid it, the gate refuses it at runtime too
      api.shell.openExternal({ url: 1 }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
  });
});

describe('createEventEmitter (main)', () => {
  function receivers(n: number) {
    return Array.from({ length: n }, () => ({ send: vi.fn() }) satisfies EventReceiver);
  }

  it('sends a valid contract event to every receiver', () => {
    const targets = receivers(2);
    const emit = createEventEmitter({ targets: () => targets });
    expect(emit(contract.errors.changed, { revision: 3 })).toBe(2);
    for (const t of targets) expect(t.send).toHaveBeenCalledWith('errors:changed', { revision: 3 });
  });

  it('reads the receivers at every emit (a closed window stops receiving)', () => {
    let targets = receivers(1);
    const emit = createEventEmitter({ targets: () => targets });
    emit(contract.errors.changed, { revision: 1 });
    targets = [];
    expect(emit(contract.errors.changed, { revision: 2 })).toBe(0);
  });

  it.each([
    ['wrong type', { revision: 'x' }],
    ['negative', { revision: -1 }],
    ['unknown key', { revision: 1, secret: 'leaked-value' }],
    ['missing', undefined],
  ])('refuses an invalid payload (%s) and sends nothing', (_, payload) => {
    const targets = receivers(1);
    const onFailure = vi.fn();
    const emit = createEventEmitter({ targets: () => targets, onFailure });
    expect(emit(contract.errors.changed, payload as never)).toBe(0);
    expect(targets[0]?.send).not.toHaveBeenCalled();
    const failure = onFailure.mock.calls[0]?.[0];
    expect(failure).toMatchObject({ channel: 'errors:changed', code: 'invalid-event' });
    expect(failure.issues).not.toContain('leaked-value');
  });

  it('refuses a spec that is not the contract one, even with the same channel name', () => {
    const targets = receivers(1);
    const onFailure = vi.fn();
    const emit = createEventEmitter({ targets: () => targets, onFailure });
    const forged: EventSpec = Object.freeze({
      kind: 'event',
      channel: 'errors:changed',
      payload: z.unknown(),
    });
    expect(emit(forged, { anything: true })).toBe(0);
    expect(targets[0]?.send).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({ channel: 'errors:changed', code: 'unknown-event' });
  });

  it('never throws when listing the receivers fails', () => {
    const onFailure = vi.fn();
    const emit = createEventEmitter({
      targets: () => {
        throw new Error('window half destroyed');
      },
      onFailure,
    });
    expect(emit(contract.errors.changed, { revision: 1 })).toBe(0);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'errors:changed', code: 'send-failed' }),
    );
  });

  it('keeps delivering when one receiver fails', () => {
    const [broken, ok] = receivers(2);
    broken!.send.mockImplementation(() => {
      throw new Error('Object has been destroyed');
    });
    const onFailure = vi.fn();
    const emit = createEventEmitter({ targets: () => [broken!, ok!], onFailure });
    expect(emit(contract.errors.changed, { revision: 1 })).toBe(1);
    expect(ok!.send).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'errors:changed', code: 'send-failed' }),
    );
  });
});

describe('events in createApi (preload)', () => {
  /** A fake ipcRenderer: records raw listeners per channel and lets the test push messages. */
  function fakeRenderer() {
    const raw = new Map<string, Set<(args: unknown[]) => void>>();
    const subscribe = vi.fn<RawSubscribe>((channel, listener) => {
      const set = raw.get(channel) ?? new Set();
      raw.set(channel, set);
      set.add(listener);
      return () => set.delete(listener);
    });
    const push = (channel: string, ...args: unknown[]) => {
      for (const l of raw.get(channel) ?? []) l(args);
    };
    const count = (channel: string) => raw.get(channel)?.size ?? 0;
    return { subscribe, push, count };
  }
  const invoke = async () => ({ ok: true, value: null });

  it('delivers only the validated payload to every subscriber', () => {
    const r = fakeRenderer();
    const api = createApi(invoke, r.subscribe);
    const a = vi.fn();
    const b = vi.fn();
    api.errors.onChanged(a);
    api.errors.onChanged(b);
    r.push('errors:changed', { revision: 7 });
    for (const l of [a, b]) {
      expect(l).toHaveBeenCalledTimes(1);
      // exactly one argument: no IPC event object, no sender
      expect(l.mock.calls[0]).toEqual([{ revision: 7 }]);
    }
  });

  it('keeps one raw listener per channel and removes it with the last subscriber', () => {
    const r = fakeRenderer();
    const api = createApi(invoke, r.subscribe);
    expect(r.count('errors:changed')).toBe(0);
    const off1 = api.errors.onChanged(() => {});
    const off2 = api.errors.onChanged(() => {});
    expect(r.count('errors:changed')).toBe(1);
    off1();
    off1(); // idempotent
    expect(r.count('errors:changed')).toBe(1);
    off2();
    expect(r.count('errors:changed')).toBe(0);
    api.errors.onChanged(() => {});
    expect(r.count('errors:changed')).toBe(1);
    expect(r.subscribe).toHaveBeenCalledTimes(2);
  });

  it('stops delivering to a subscriber that left', () => {
    const r = fakeRenderer();
    const api = createApi(invoke, r.subscribe);
    const stay = vi.fn();
    const leave = vi.fn();
    api.errors.onChanged(stay);
    const off = api.errors.onChanged(leave);
    off();
    r.push('errors:changed', { revision: 1 });
    expect(leave).not.toHaveBeenCalled();
    expect(stay).toHaveBeenCalledOnce();
  });

  it.each([
    ['invalid payload', [{ revision: 'x' }]],
    ['unknown key', [{ revision: 1, extra: true }]],
    ['no argument', []],
    ['two arguments', [{ revision: 1 }, 'extra']],
  ])('drops a message that does not match the contract (%s)', (_, args) => {
    const r = fakeRenderer();
    const onInvalidEvent = vi.fn();
    const api = createApi(invoke, r.subscribe, { onInvalidEvent });
    const l = vi.fn();
    api.errors.onChanged(l);
    r.push('errors:changed', ...args);
    expect(l).not.toHaveBeenCalled();
    expect(onInvalidEvent).toHaveBeenCalledWith('errors:changed');
  });

  it('isolates subscribers: one that throws does not stop the others', () => {
    const r = fakeRenderer();
    const onListenerError = vi.fn();
    const api = createApi(invoke, r.subscribe, { onListenerError });
    const boom = new Error('subscriber bug');
    api.errors.onChanged(() => {
      throw boom;
    });
    const after = vi.fn();
    api.errors.onChanged(after);
    r.push('errors:changed', { revision: 2 });
    expect(after).toHaveBeenCalledOnce();
    expect(onListenerError).toHaveBeenCalledWith(boom, 'errors:changed');
  });

  it('reports each distinct subscriber error once, so reporting cannot feed itself', () => {
    const r = fakeRenderer();
    const onListenerError = vi.fn();
    const api = createApi(invoke, r.subscribe, { onListenerError });
    api.errors.onChanged(() => {
      throw new Error('same bug');
    });
    for (let i = 1; i <= 5; i++) r.push('errors:changed', { revision: i });
    expect(onListenerError).toHaveBeenCalledOnce();
  });

  it('leaves no orphan subscriber when attaching the raw listener fails', () => {
    const r = fakeRenderer();
    let fail = true;
    const subscribe: RawSubscribe = (channel, listener) => {
      if (fail) throw new Error('ipcRenderer gone');
      return r.subscribe(channel, listener);
    };
    const api = createApi(invoke, subscribe);
    const orphan = vi.fn();
    expect(() => api.errors.onChanged(orphan)).toThrow('ipcRenderer gone');
    fail = false;
    api.errors.onChanged(() => {});
    r.push('errors:changed', { revision: 1 });
    expect(orphan).not.toHaveBeenCalled();
  });

  it('refuses a listener that is not a function', () => {
    const r = fakeRenderer();
    const api = createApi(invoke, r.subscribe);
    expect(() =>
      // @ts-expect-error: the types forbid it, the preload refuses it at runtime too
      api.errors.onChanged('not a function'),
    ).toThrow(TypeError);
    expect(r.subscribe).not.toHaveBeenCalled();
  });

  it('works end to end from the emitter to the subscriber', () => {
    const r = fakeRenderer();
    const api = createApi(invoke, r.subscribe);
    const emit = createEventEmitter({
      targets: () => [{ send: (channel, payload) => r.push(channel, payload) }],
    });
    const l = vi.fn();
    api.errors.onChanged(l);
    emit(contract.errors.changed, { revision: 9 });
    expect(l).toHaveBeenCalledWith({ revision: 9 });
  });
});
