import { makeTextCleaner } from '@control-center/event-schema';
import { describe, expect, it, vi } from 'vitest';
import { createClaudePermissions } from './permissions';

const ask = (requestId: string, command: string) => ({
  type: 'control_request',
  request_id: requestId,
  request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command } },
});

describe('Claude control permissions', () => {
  it('matches approvals against original arguments and keeps secrets out of the display', () => {
    const write = vi.fn<(line: string) => boolean>(() => true);
    const publish = vi.fn();
    const permissions = createClaudePermissions(makeTextCleaner(''), write, publish);
    const first = 'echo password=first-sensitive-value';
    permissions.receive(ask('first', first));
    const request = publish.mock.lastCall?.[0]?.[0];
    expect(request.details).toContain('<redacted:assignment>');
    expect(request.details).not.toContain('first-sensitive-value');
    expect(permissions.respond(request.requestId, 'session')).toBe(true);
    permissions.clear();
    permissions.receive(ask('second', first));
    expect(JSON.parse(write.mock.lastCall?.[0] ?? '{}')).toMatchObject({
      response: { request_id: 'second', response: { updatedInput: { command: first } } },
    });
    permissions.receive(ask('different', 'echo password=other-sensitive-value'));
    expect(write).toHaveBeenCalledTimes(2);
    expect(publish.mock.lastCall?.[0]).toHaveLength(1);
  });

  it('rejects stale UI decisions when the CLI cancels or reuses its wire ID', () => {
    const write = vi.fn(() => true);
    const publish = vi.fn();
    const permissions = createClaudePermissions((text) => text, write, publish);
    permissions.receive(ask('wire-id', 'echo first'));
    const staleId = publish.mock.lastCall?.[0]?.[0]?.requestId;
    permissions.receive({ type: 'control_cancel_request', request_id: 'wire-id' });
    expect(publish).toHaveBeenLastCalledWith([]);
    permissions.receive(ask('wire-id', 'echo second'));
    expect(permissions.respond(staleId, 'approve')).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
