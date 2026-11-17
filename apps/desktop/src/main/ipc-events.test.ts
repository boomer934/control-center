import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesce, makeFailureRouter } from './ipc-events';

describe('coalesce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once per burst, after the delay', () => {
    const fire = vi.fn();
    const c = coalesce(50, fire);
    for (let i = 0; i < 100; i++) c.trigger();
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fire).toHaveBeenCalledOnce();
    c.trigger();
    vi.advanceTimersByTime(50);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('cancel drops a pending fire', () => {
    const fire = vi.fn();
    const c = coalesce(50, fire);
    c.trigger();
    c.cancel();
    vi.advanceTimersByTime(100);
    expect(fire).not.toHaveBeenCalled();
  });
});

describe('makeFailureRouter', () => {
  function deps() {
    return {
      logger: { error: vi.fn() } as unknown as Parameters<typeof makeFailureRouter>[0]['logger'],
      reportIpcFailure: vi.fn(),
    };
  }

  it('records failures of methods and events in the Console', () => {
    const d = deps();
    const cause = new Error('boom');
    makeFailureRouter(d)({ channel: 'shell:open-external', code: 'handler-failed', cause });
    expect(d.reportIpcFailure).toHaveBeenCalledWith(
      'shell:open-external',
      'handler-failed',
      cause,
      undefined,
    );
  });

  it('keeps only the issue summary of a schema failure, never the zod error', () => {
    const d = deps();
    makeFailureRouter(d)({
      channel: 'shell:open-external',
      code: 'invalid-request',
      cause: { received: 'secret-value' },
      issues: 'url: expected string',
    });
    expect(d.reportIpcFailure).toHaveBeenCalledWith(
      'shell:open-external',
      'invalid-request',
      undefined,
      'url: expected string',
    );
  });

  it('sends a failure of errors:changed to the log only, so it cannot loop', () => {
    const d = deps();
    makeFailureRouter(d)({ channel: 'errors:changed', code: 'send-failed', cause: new Error() });
    expect(d.reportIpcFailure).not.toHaveBeenCalled();
    expect(d.logger.error).toHaveBeenCalledWith('ipc', 'event-failed', {
      channel: 'errors:changed',
      code: 'send-failed',
    });
  });
});
