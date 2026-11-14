// Claude Code `--output-format stream-json` → AgentEvents.
//
// The stream knows what the model did and why: messages, tool calls with their inputs, tool
// results (errors included), permission denials, which agent each line belongs to
// (`parent_tool_use_id`) and token usage. Its timestamps are coarse (one per API message), so the
// hooks normalizer gives the precise ones and mergeClaudeSession combines the two.
import type { AgentEvent, AgentId } from '../schema';
import {
  agentOf,
  diffOf,
  EPOCH,
  EventLog,
  failingCount,
  failureReason,
  filePathOf,
  int,
  isObj,
  iso,
  makeTools,
  num,
  parseMcpName,
  resultText,
  searchedFiles,
  sessionUsage,
  short,
  str,
  toolKind,
  type NormalizeContext,
  type Obj,
} from './common';

interface PendingTool {
  name: string;
  input: Obj;
  agentId: AgentId;
  at: string;
}

export function normalizeClaudeStream(
  lines: readonly unknown[],
  ctx: NormalizeContext,
): AgentEvent[] {
  const records = lines.filter(isObj);
  const init = records.find((l) => l.type === 'system' && l.subtype === 'init');
  const cwd = ctx.cwd ?? str(init?.cwd) ?? '';
  const { text, file, target } = makeTools(cwd);
  const log = new EventLog(ctx.sessionId, 'stream', 'claude');

  let now = records.map((l) => iso(l.timestamp)).find((t) => t !== undefined) ?? EPOCH;
  const tools = new Map<string, PendingTool>();
  const denied = new Map<string, string>(); // toolUseId → message
  const announced = new Set<string>(); // toolUseIds whose denial was already emitted
  const usageSeen = new Set<string>();
  let status: 'completed' | 'blocked' | 'failed' | undefined;
  let summary: string | undefined;

  const emitDenial = (
    toolUseId: string,
    tool: string | undefined,
    detail: string,
    agentId: AgentId,
  ) => {
    if (announced.has(toolUseId)) return;
    announced.add(toolUseId);
    const base = { timestamp: now, agentId, toolUseId, ...(tool ? { tool } : {}) };
    log.push({ ...base, type: 'permission.requested', ...(detail ? { detail } : {}) });
    log.push({
      ...base,
      type: 'permission.resolved',
      decision: 'denied',
      by: 'policy',
      ...(detail ? { detail } : {}),
    });
  };

  for (const line of records) {
    now = iso(line.timestamp) ?? now;
    const agentId = agentOf(line.parent_tool_use_id);
    const msg = isObj(line.message) ? line.message : undefined;

    if (line.type === 'system') {
      if (line.subtype === 'init') {
        log.push({
          type: 'session.started',
          timestamp: now,
          agentId: 'main',
          ...(str(line.model) ? { model: str(line.model) } : {}),
          ...(str(line.permissionMode) ? { permissionMode: str(line.permissionMode) } : {}),
          ...(str(line.claude_code_version) ? { cliVersion: str(line.claude_code_version) } : {}),
        });
      } else if (line.subtype === 'permission_denied') {
        const id = str(line.tool_use_id);
        if (!id) continue;
        const detail = short(text(str(line.message) ?? ''));
        denied.set(id, detail);
        emitDenial(id, str(line.tool_name), detail, tools.get(id)?.agentId ?? 'main');
      } else if (line.subtype === 'post_turn_summary') {
        const cat = str(line.status_category);
        status =
          cat === 'blocked'
            ? 'blocked'
            : cat === 'failed' || cat === 'error'
              ? 'failed'
              : 'completed';
        summary = text(str(line.status_detail) ?? '') || summary;
      }
      continue;
    }

    if (line.type === 'assistant' && msg) {
      const content = Array.isArray(msg.content) ? msg.content : [];
      const model = str(msg.model);
      for (const c of content) {
        if (!isObj(c)) continue;
        if (c.type === 'text') {
          const t = text(str(c.text) ?? '');
          if (t)
            log.push({
              type: 'message.assistant',
              timestamp: now,
              agentId,
              text: t,
              ...(model ? { model } : {}),
            });
        } else if (c.type === 'tool_use') {
          const id = str(c.id);
          const name = str(c.name);
          if (!id || !name) continue;
          const input = isObj(c.input) ? c.input : {};
          tools.set(id, { name, input, agentId, at: now });
          const kind = toolKind(name);
          log.push({
            type: 'tool.called',
            timestamp: now,
            agentId,
            toolUseId: id,
            tool: name,
            kind,
            target: target(name, input),
          });
          if (kind === 'agent') {
            const task = text(str(input.description) ?? '');
            const sub = str(input.model);
            log.push({
              type: 'agent.spawned',
              timestamp: now,
              agentId: `sub:${id}`,
              parentAgentId: agentId,
              name: str(input.subagent_type) ?? 'agent',
              ...(task ? { task } : {}),
              ...(sub ? { model: sub } : {}),
              toolUseId: id,
            });
          } else if (kind === 'mcp') {
            const mcp = parseMcpName(name);
            if (mcp)
              log.push({ type: 'mcp.called', timestamp: now, agentId, toolUseId: id, ...mcp });
          }
        }
      }
      // one API message is split over several lines that repeat the same usage: count it once
      const usage = isObj(msg.usage) ? msg.usage : undefined;
      const key = str(msg.id);
      if (usage && key && !usageSeen.has(key)) {
        usageSeen.add(key);
        log.push({
          type: 'usage.updated',
          timestamp: now,
          agentId,
          scope: 'message',
          ...(model ? { model } : {}),
          inputTokens: int(usage.input_tokens),
          outputTokens: int(usage.output_tokens),
          cacheReadTokens: int(usage.cache_read_input_tokens),
          cacheCreationTokens: int(usage.cache_creation_input_tokens),
        });
      }
      continue;
    }

    if (line.type === 'user' && msg) {
      if (typeof msg.content === 'string') {
        const t = text(msg.content);
        if (t) log.push({ type: 'message.user', timestamp: now, agentId, text: t });
        continue;
      }
      const content = Array.isArray(msg.content) ? msg.content : [];
      const meta = Array.isArray(line.tool_result_meta) ? line.tool_result_meta.filter(isObj) : [];
      const response = isObj(line.tool_use_result) ? line.tool_use_result : {};
      for (const c of content) {
        if (!isObj(c)) continue;
        if (c.type === 'text') {
          const t = text(str(c.text) ?? '');
          if (t) log.push({ type: 'message.user', timestamp: now, agentId, text: t });
          continue;
        }
        if (c.type !== 'tool_result') continue;
        const id = str(c.tool_use_id);
        const tool = id ? tools.get(id) : undefined;
        if (!id || !tool) continue;
        const durationMs = Math.max(0, Date.parse(now) - Date.parse(tool.at));
        const body = resultText(c.content);
        const decision = meta.find((m) => m.id === id);
        const rejected =
          isObj(decision?.permission_decision) &&
          decision.permission_decision.decision === 'reject';
        const kind = toolKind(tool.name);
        const base = { timestamp: now, agentId: tool.agentId, toolUseId: id, durationMs };

        if (denied.has(id) || rejected) {
          const detail = denied.get(id) ?? short(text(body));
          emitDenial(id, tool.name, detail, tool.agentId);
          log.push({
            ...base,
            type: 'tool.failed',
            reason: 'denied',
            ...(detail ? { detail } : {}),
          });
          if (kind === 'agent')
            log.push({ type: 'agent.finished', timestamp: now, agentId: `sub:${id}`, ok: false });
          continue;
        }
        if (c.is_error === true) {
          const detail = short(text(body));
          log.push({
            ...base,
            type: 'tool.failed',
            reason: failureReason(body),
            ...(detail ? { detail } : {}),
          });
          if (kind === 'agent')
            log.push({ type: 'agent.finished', timestamp: now, agentId: `sub:${id}`, ok: false });
          continue;
        }
        if (kind === 'shell') {
          const n = failingCount(str(response.stdout) ?? body);
          if (n > 0) {
            log.push({
              ...base,
              type: 'tool.failed',
              reason: 'tests-failing',
              detail: `${n} failing`,
            });
            continue;
          }
        }
        const files = kind === 'search' ? searchedFiles(response).map(file) : [];
        log.push({ ...base, type: 'tool.completed', ...(files.length ? { files } : {}) });
        const fp = filePathOf(tool.input);
        if (kind === 'read' && fp)
          log.push({
            type: 'file.read',
            timestamp: now,
            agentId: tool.agentId,
            toolUseId: id,
            file: file(fp),
          });
        if (kind === 'write' && fp) {
          log.push({
            type: 'file.written',
            timestamp: now,
            agentId: tool.agentId,
            toolUseId: id,
            file: file(fp),
            ...diffOf(tool.input, response),
          });
        }
        if (kind === 'agent') {
          const total = num(response.totalDurationMs);
          const tokens = num(response.totalTokens);
          log.push({
            type: 'agent.finished',
            timestamp: now,
            agentId: `sub:${id}`,
            ok: str(response.status) !== 'failed',
            ...(total !== undefined ? { durationMs: total } : {}),
            ...(tokens !== undefined ? { tokens: int(tokens) } : {}),
          });
        }
      }
      continue;
    }

    if (line.type === 'result') {
      for (const d of Array.isArray(line.permission_denials)
        ? line.permission_denials.filter(isObj)
        : []) {
        const id = str(d.tool_use_id);
        if (id)
          emitDenial(id, str(d.tool_name), denied.get(id) ?? '', tools.get(id)?.agentId ?? 'main');
      }
      const cost = num(line.total_cost_usd);
      log.push({
        type: 'usage.updated',
        timestamp: now,
        agentId: 'main',
        scope: 'session',
        ...sessionUsage(line),
        ...(cost !== undefined ? { costUsd: cost } : {}),
      });
      const failed = line.is_error === true;
      const duration = num(line.duration_ms);
      const turns = num(line.num_turns);
      const result = text(str(line.result) ?? '');
      log.push({
        type: 'session.ended',
        timestamp: now,
        agentId: 'main',
        ok: !failed,
        status: failed ? 'failed' : (status ?? 'completed'),
        ...(str(line.terminal_reason) ? { reason: str(line.terminal_reason) } : {}),
        ...(summary || result ? { summary: short(summary ?? result) } : {}),
        ...(duration !== undefined ? { durationMs: duration } : {}),
        ...(turns !== undefined ? { turns: int(turns) } : {}),
        ...(cost !== undefined ? { costUsd: cost } : {}),
      });
    }
    // rate_limit_event, hook_* and other system lines carry nothing the Live view draws
  }
  return log.events;
}
