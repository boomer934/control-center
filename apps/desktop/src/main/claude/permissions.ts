import { createHash, randomUUID } from 'node:crypto';
import {
  MAX_CLAUDE_PERMISSION_DETAILS,
  MAX_CLAUDE_PERMISSION_REQUESTS,
  type ClaudePermission,
  type ClaudePermissionChoice,
} from '@control-center/ipc-contract/claude';
import { z } from 'zod';

const controlEnvelope = z.looseObject({
  request_id: z.string().min(1).max(256),
});
const toolRequest = z.looseObject({
  subtype: z.literal('can_use_tool'),
  tool_name: z.string().min(1).max(256),
  input: z.record(z.string(), z.unknown()),
});
type ToolRequest = z.infer<typeof toolRequest>;
type Decision =
  | { behavior: 'allow'; updatedInput: ToolRequest['input'] }
  | {
      behavior: 'deny';
      message: string;
    };
type Reply = { subtype: 'success'; response: Decision } | { subtype: 'error'; error: string };

interface Pending {
  wireId: string;
  tool: ToolRequest;
  fingerprint: string;
  view: ClaudePermission;
}

const MAX_SESSION_APPROVALS = 128;
const deny = (message: string): Decision => ({ behavior: 'deny', message });
const allow = (tool: ToolRequest): Decision => ({ behavior: 'allow', updatedInput: tool.input });

export function createClaudePermissions(
  clean: (text: string) => string,
  write: (line: string) => boolean,
  publish: (requests: ClaudePermission[]) => void,
) {
  const pending = new Map<string, Pending>();
  const remembered = new Set<string>();
  const update = () => publish([...pending.values()].map(({ view }) => view));
  const reply = (wireId: string, response: Reply) =>
    write(
      JSON.stringify({
        type: 'control_response',
        response: { ...response, request_id: wireId },
      }),
    );
  const decide = (wireId: string, response: Decision) =>
    reply(wireId, { subtype: 'success', response });

  return {
    receive(line: { type: string; [key: string]: unknown }): boolean {
      if (line.type !== 'control_request' && line.type !== 'control_cancel_request') return false;
      const envelope = controlEnvelope.safeParse(line);
      if (!envelope.success) return true;
      const wireId = envelope.data.request_id;
      if (line.type === 'control_cancel_request') {
        const existing = [...pending.values()].find((entry) => entry.wireId === wireId);
        if (existing && pending.delete(existing.view.requestId)) update();
        return true;
      }
      if ([...pending.values()].some((entry) => entry.wireId === wireId)) return true;
      const parsed = toolRequest.safeParse(line.request);
      if (!parsed.success) {
        reply(wireId, { subtype: 'error', error: 'Unsupported or invalid control request' });
        return true;
      }

      const tool = parsed.data;
      const details = clean(JSON.stringify(tool.input, null, 2));
      const displayTool = clean(tool.tool_name);
      if (
        details.length > MAX_CLAUDE_PERMISSION_DETAILS ||
        !displayTool ||
        displayTool.length > 256 ||
        pending.size >= MAX_CLAUDE_PERMISSION_REQUESTS
      ) {
        decide(wireId, deny('Control Center could not display this permission request'));
        return true;
      }
      // Hash the original input, never its redacted display. Matching is deliberately exact.
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([tool.tool_name, tool.input]))
        .digest('hex');
      if (remembered.has(fingerprint)) {
        decide(wireId, allow(tool));
        return true;
      }
      const requestId = randomUUID();
      const view: ClaudePermission = {
        requestId,
        tool: displayTool,
        details,
        canRemember: remembered.size < MAX_SESSION_APPROVALS,
      };
      pending.set(requestId, { wireId, tool, fingerprint, view });
      update();
      return true;
    },
    respond(requestId: string, choice: ClaudePermissionChoice): boolean {
      const request = pending.get(requestId);
      if (!request || (choice === 'session' && remembered.size >= MAX_SESSION_APPROVALS))
        return false;
      if (
        !decide(
          request.wireId,
          choice === 'deny' ? deny('Denied by the user') : allow(request.tool),
        )
      )
        return false;
      if (choice === 'session') remembered.add(request.fingerprint);
      pending.delete(requestId);
      update();
      return true;
    },
    clear(): void {
      if (pending.size === 0) return;
      pending.clear();
      update();
    },
  };
}
