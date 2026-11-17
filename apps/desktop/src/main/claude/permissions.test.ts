import { makeTextCleaner } from '@control-center/event-schema';
import {
  ClaudePermissionSchema,
  MAX_CLAUDE_PERMISSION_DETAILS,
} from '@control-center/ipc-contract/claude';
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

    const nextSession = createClaudePermissions(makeTextCleaner(''), write, publish);
    nextSession.receive(ask('new-session', first));
    expect(write).toHaveBeenCalledTimes(2);
    expect(publish.mock.lastCall?.[0]).toHaveLength(1);
  });

  it('truncates large details while approving the original input exactly once', () => {
    const write = vi.fn<(line: string) => boolean>(() => true);
    const publish = vi.fn();
    const permissions = createClaudePermissions((text) => text, write, publish);
    const command = 'x'.repeat(MAX_CLAUDE_PERMISSION_DETAILS + 20);
    permissions.receive(ask('long', command));
    const request = ClaudePermissionSchema.parse(publish.mock.lastCall?.[0]?.[0]);
    expect(request.truncated).toBe(true);
    const fullLength = JSON.stringify({ command }, null, 2).length;
    expect(request.details).toHaveLength(MAX_CLAUDE_PERMISSION_DETAILS);
    expect(request.details.endsWith(`… (truncated, ${fullLength} chars)`)).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(permissions.respond(request.requestId, 'approve')).toBe(true);
    expect(permissions.respond(request.requestId, 'deny')).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
      response: { request_id: 'long', response: { updatedInput: { command } } },
    });
  });

  it('rejects duplicate pending wire IDs with a control error', () => {
    const write = vi.fn<(line: string) => boolean>(() => true);
    const publish = vi.fn();
    const permissions = createClaudePermissions((text) => text, write, publish);
    permissions.receive(ask('same', 'echo first'));
    const request = ClaudePermissionSchema.parse(publish.mock.lastCall?.[0]?.[0]);
    permissions.receive(ask('same', 'echo duplicate'));
    expect(publish).toHaveBeenLastCalledWith([]);
    expect(permissions.respond(request.requestId, 'approve')).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
      type: 'control_response',
      response: { request_id: 'same', subtype: 'error' },
    });
  });

  it('refreshes pending decisions when remembered approvals reach the limit', () => {
    const publish = vi.fn();
    const permissions = createClaudePermissions(
      (text) => text,
      () => true,
      publish,
    );
    for (let i = 0; i < 127; i++) {
      permissions.receive(ask(`wire-${i}`, `echo ${i}`));
      expect(permissions.respond(publish.mock.lastCall?.[0]?.[0]?.requestId, 'session')).toBe(true);
    }
    permissions.receive(ask('last-rule', 'echo last rule'));
    permissions.receive(ask('still-open', 'echo still open'));
    const [last, remaining] = publish.mock.lastCall?.[0] ?? [];
    expect(remaining.canRemember).toBe(true);
    expect(permissions.respond(last.requestId, 'session')).toBe(true);
    expect(publish).toHaveBeenLastCalledWith([{ ...remaining, canRemember: false }]);
    expect(permissions.respond(remaining.requestId, 'session')).toBe(false);
    expect(permissions.respond(remaining.requestId, 'approve')).toBe(true);
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
