import { describe, expect, it, vi } from 'vitest';
import { createRpcClient, MAX_LINE_CHARS, RpcError } from './rpc';

function setup(timeoutMs?: number) {
  const written: string[] = [];
  const handlers = { onNotification: vi.fn(), onRequest: vi.fn(), onInvalid: vi.fn() };
  const rpc = createRpcClient((line) => (written.push(line), true), handlers, timeoutMs);
  const sent = () => written.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { rpc, handlers, sent };
}

describe('createRpcClient', () => {
  it('matches responses to requests, across chunk boundaries', async () => {
    const { rpc, sent } = setup();
    const a = rpc.request('model/list', {});
    const b = rpc.request('thread/start', { cwd: 'x' });
    expect(sent()).toEqual([
      { id: 1, method: 'model/list', params: {} },
      { id: 2, method: 'thread/start', params: { cwd: 'x' } },
    ]);
    rpc.push('{"id":2,"result":{"thread":1}}\n{"id":1,');
    rpc.push('"error":{"code":-32600,"message":"bad"}}\r\n');
    await expect(b).resolves.toEqual({ thread: 1 });
    await expect(a).rejects.toMatchObject({
      name: 'CodexRpcError',
      method: 'model/list',
      code: -32600,
    });
  });

  it('dispatches notifications and server requests, and counts anything else', () => {
    const { rpc, handlers } = setup();
    rpc.push('{"method":"turn/started","params":{"threadId":"t"}}\n');
    rpc.push('{"id":0,"method":"item/commandExecution/requestApproval","params":{"itemId":"i"}}\n');
    rpc.push('not json\n{"hello":1}\n[]\n');
    expect(handlers.onNotification).toHaveBeenCalledWith('turn/started', { threadId: 't' });
    expect(handlers.onRequest).toHaveBeenCalledWith(0, 'item/commandExecution/requestApproval', {
      itemId: 'i',
    });
    expect(handlers.onInvalid).toHaveBeenCalledTimes(3);
  });

  it('drops an oversized line without losing the next one', () => {
    const { rpc, handlers } = setup();
    rpc.push('x'.repeat(MAX_LINE_CHARS + 1));
    rpc.push('yyy\n{"method":"a"}\n');
    expect(handlers.onInvalid).toHaveBeenCalledTimes(1);
    expect(handlers.onNotification).toHaveBeenCalledWith('a', undefined);
  });

  it('times out and fails pending requests on close', async () => {
    vi.useFakeTimers();
    try {
      const { rpc } = setup(1000);
      const slow = rpc.request('initialize', {});
      const pending = rpc.request('model/list', {}, 5000);
      vi.advanceTimersByTime(1001);
      await expect(slow).rejects.toMatchObject({ code: 'timeout' });
      rpc.close();
      await expect(pending).rejects.toBeInstanceOf(RpcError);
      await expect(rpc.request('x', {})).rejects.toMatchObject({ code: 'closed' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes responses to server requests', () => {
    const { rpc, sent } = setup();
    rpc.respond(0, { decision: 'accept' });
    rpc.respondError('a', -32601, 'no');
    rpc.notify('initialized');
    expect(sent()).toEqual([
      { id: 0, result: { decision: 'accept' } },
      { id: 'a', error: { code: -32601, message: 'no' } },
      { method: 'initialized' },
    ]);
  });
});
