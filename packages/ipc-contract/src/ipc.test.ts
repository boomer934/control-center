import { describe, expect, it, vi } from 'vitest';
import { contract, IpcError, listChannels, type AppInfo, type Handlers } from './index';
import { registerIpcHandlers, type IpcMainLike, type IpcSenderEvent } from './main';
import { createApi, unwrapEnvelope } from './preload';

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

const errorsStub: Handlers['errors'] = {
  list: () => ({ revision: 0, groups: [] }),
  reportRenderer: () => ({ id: 'abc' }),
  copyReport: () => ({ copied: true, groups: 0 }),
  clear: () => ({ cleared: 0 }),
};

function makeHandlers(overrides: Partial<{ getInfo: unknown; openExternal: unknown }> = {}) {
  const getInfo = vi.fn(() => (overrides.getInfo ?? info) as AppInfo);
  const openExternal = vi.fn(({ url }: { url: string }) => ({ opened: url.startsWith('https:') }));
  const handlers: Handlers = { app: { getInfo }, errors: errorsStub, shell: { openExternal } };
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
      'shell:open-external',
    ]);
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
    expect([...ipc.listeners.keys()].sort()).toEqual(listChannels().sort());
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
        app: {
          getInfo: () => {
            throw new Error(`cannot read ${secretPath}`);
          },
        },
        errors: errorsStub,
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
    const api = createApi(async () => ({ ok: true, value: null }));
    expect(Object.keys(api)).toEqual(['app', 'errors', 'shell']);
    expect(Object.keys(api.app)).toEqual(['getInfo']);
    expect(Object.keys(api.errors)).toEqual(['list', 'reportRenderer', 'copyReport', 'clear']);
    expect(Object.keys(api.shell)).toEqual(['openExternal']);
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.app)).toBe(true);
    expect(Object.isFrozen(api.shell)).toBe(true);
  });

  it('sends on the contract channel and unwraps the value', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: { opened: true } }));
    const api = createApi(invoke);
    await expect(api.shell.openExternal({ url: 'https://x.dev' })).resolves.toEqual({
      opened: true,
    });
    expect(invoke).toHaveBeenCalledWith('shell:open-external', { url: 'https://x.dev' });
  });

  it('turns an error envelope into an IpcError', async () => {
    const api = createApi(async () => ({
      ok: false,
      error: { code: 'untrusted-sender', message: 'Sender not allowed' },
    }));
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
    const api = createApi((channel, ...args) => ipc.call(channel, trusted, ...args));
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
