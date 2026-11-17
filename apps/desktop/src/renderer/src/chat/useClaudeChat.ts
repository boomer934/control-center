import { useEffect, useRef, useState } from 'react';
import type {
  ClaudeHistoryRecord,
  ClaudeHistorySummary,
  ClaudePermission,
  ClaudePermissionChoice,
  ClaudeStartResult,
  ClaudeUpdate,
} from '@control-center/ipc-contract/claude';

interface Chat {
  id?: string;
  historyId?: string;
  resumable?: boolean;
  status: 'idle' | 'running' | 'closed';
  records: ClaudeHistoryRecord[];
  partial: string;
  permissions: ClaudePermission[];
  draft: string;
  error?: string;
}

const blank: Chat = { status: 'idle', records: [], partial: '', permissions: [], draft: '' };
const startError: Record<Exclude<ClaudeStartResult, 'started'>, string> = {
  'claude-unavailable': 'Claude Code was not found on PATH.',
  'workspace-unavailable': 'Open this workspace again to send a message.',
  'history-unavailable': 'This session could not be resumed.',
  limit: 'Close an open Claude session before starting another.',
  failed: 'Claude Code could not start. See Problems for details.',
};

function applyUpdate(chat: Chat, update: ClaudeUpdate): Chat {
  switch (update.kind) {
    case 'permissions':
      return { ...chat, permissions: update.requests };
    case 'partial':
      return { ...chat, partial: update.text };
    case 'status':
      return {
        ...chat,
        status: update.status,
        ...(update.status !== 'running' && { partial: '', permissions: [] }),
      };
    case 'events':
      return { ...chat, records: [...chat.records, { kind: 'events', events: update.events }] };
    case 'prompt':
      return { ...chat, records: [...chat.records, { kind: 'prompt', text: update.text }] };
  }
}

export function useClaudeChat(workspaceId?: string) {
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const owners = useRef(new Map<string, string>());
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const chat = (workspaceId && chats[workspaceId]) || blank;
  const api = window.api.claude;

  const update = (workspace: string, change: (value: Chat) => Chat) => {
    setChats((previous) => ({
      ...previous,
      [workspace]: change(previous[workspace] ?? blank),
    }));
  };

  useEffect(() => {
    const byId = owners.current;
    return api.onUpdated((event) => {
      const workspace = byId.get(event.id);
      if (workspace) update(workspace, (value) => applyUpdate(value, event));
    });
  }, [api]);

  const perform = async <T>(action: (workspace: string) => Promise<T>, busyMessage?: string) => {
    if (!workspaceId) return;
    const workspace = workspaceId;
    if (busy.current) {
      if (busyMessage) update(workspace, (value) => ({ ...value, error: busyMessage }));
      return;
    }
    busy.current = true;
    setPending(workspace);
    update(workspace, (value) => ({ ...value, error: undefined }));
    try {
      return await action(workspace);
    } catch {
      update(workspace, (value) => ({
        ...value,
        error: 'Claude session action failed. Try again.',
      }));
    } finally {
      busy.current = false;
      setPending(null);
    }
  };

  const open = async (workspace: string, historyId?: string) => {
    const id = crypto.randomUUID();
    owners.current.set(id, workspace);
    try {
      const result = await api.start({ id, workspaceId: workspace, historyId });
      if (result === 'started') {
        update(workspace, (value) => ({ ...value, id, status: 'idle' }));
        return id;
      }
      update(workspace, (value) => ({ ...value, error: startError[result] }));
    } catch {
      owners.current.delete(id);
      throw new Error('Could not start Claude');
    }
    owners.current.delete(id);
    return undefined;
  };

  const close = async () => {
    if (!chat.id) return;
    await api.close({ id: chat.id });
    owners.current.delete(chat.id);
  };

  return {
    ...chat,
    pending: pending !== null,
    setDraft(draft: string) {
      if (workspaceId) update(workspaceId, (value) => ({ ...value, draft }));
    },
    async listHistory(): Promise<ClaudeHistorySummary[]> {
      return workspaceId ? api.listHistory({ workspaceId }) : [];
    },
    loadHistory: (historyId: string) =>
      perform(async (workspace) => {
        if (chat.status === 'running') return;
        const previous = await api.readHistory({ workspaceId: workspace, historyId });
        if (!previous) {
          update(workspace, (value) => ({
            ...value,
            error: 'This session history is unavailable.',
          }));
          return;
        }
        await close();
        update(workspace, () => ({ ...blank, ...previous, historyId }));
      }),
    resume: () =>
      perform(async (workspace) => {
        if (chat.historyId && chat.resumable && !chat.id) await open(workspace, chat.historyId);
      }),
    newSession: () =>
      perform(async (workspace) => {
        if (chat.status === 'running') return;
        await close();
        update(workspace, () => blank);
      }),
    send: (text: string) =>
      perform(async (workspace) => {
        if (chat.status === 'running' || (chat.historyId && !chat.id)) return;
        const id = chat.id ?? (await open(workspace));
        if (!id) return;
        const result = await api.send({ id, text });
        if (result === 'started') {
          update(workspace, (value) => (value.draft === text ? { ...value, draft: '' } : value));
          return;
        }
        if (result === 'closed') {
          owners.current.delete(id);
          update(workspace, (value) => ({
            ...value,
            id: undefined,
            status: 'closed',
            permissions: [],
          }));
        }
        update(workspace, (value) => ({
          ...value,
          error: 'The message could not be sent. Try again.',
        }));
      }),
    interrupt: () =>
      perform(async (workspace) => {
        if (chat.id && !(await api.interrupt({ id: chat.id })))
          update(workspace, (value) => ({ ...value, error: 'Claude is no longer running.' }));
      }),
    respond: (requestId: string, choice: ClaudePermissionChoice) =>
      perform(async (workspace) => {
        if (chat.id && (await api.respond({ id: chat.id, requestId, choice }))) return;
        update(workspace, (value) => {
          const request = value.permissions.find(
            (permission) => permission.requestId === requestId,
          );
          const error =
            !value.id || !request
              ? 'This permission request is no longer open.'
              : choice === 'session' && !request.canRemember
                ? 'This session has reached its approval limit. Choose Approve or Deny.'
                : 'Could not submit the permission decision. Try again.';
          return { ...value, error };
        });
      }, 'Wait for the current action to finish, then submit your permission decision again.'),
  };
}

export type ClaudeChat = ReturnType<typeof useClaudeChat>;
