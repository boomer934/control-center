// The text behind "copy report": a plain-text summary of the error groups, meant to be pasted into
// an issue. The whole text passes through `clean` once more at the end: even a field added later
// cannot carry a secret out.
import type { ErrorGroup, StackFrame } from './types';

export interface ReportMeta {
  app: string;
  version: string;
  electron: string;
  platform: string;
  generatedAt: Date;
}

function frameLine(f: StackFrame): string {
  const pos = f.line === null ? '' : `:${f.line}${f.column === null ? '' : `:${f.column}`}`;
  return f.fn ? `${f.fn} (${f.file}${pos})` : `${f.file}${pos}`;
}

function groupBlock(g: ErrorGroup, index: number): string {
  const lines = [
    `## ${index + 1}. [${g.source}] ${g.kind}${g.count > 1 ? ` ×${g.count}` : ''}`,
    `${g.name}: ${g.message}`,
  ];
  let collapsed = 0;
  const flush = () => {
    if (collapsed > 0) lines.push(`  … ${collapsed} dependency/internal frame(s)`);
    collapsed = 0;
  };
  for (const f of g.frames) {
    if (f.kind === 'project') {
      flush();
      lines.push(`  at ${frameLine(f)}`);
    } else collapsed += 1;
  }
  flush();
  lines.push(`first seen ${g.firstSeen} · last seen ${g.lastSeen}`);
  return lines.join('\n');
}

export function formatReport(
  groups: readonly ErrorGroup[],
  meta: ReportMeta,
  clean: (text: string) => string,
): string {
  const total = groups.reduce((n, g) => n + g.count, 0);
  const head = [
    `${meta.app} error report`,
    `${meta.app} ${meta.version} · Electron ${meta.electron} · ${meta.platform} · ${meta.generatedAt.toISOString()}`,
    `${groups.length} group(s), ${total} occurrence(s). Secrets and personal paths are redacted.`,
    '',
  ];
  const body = groups.length ? groups.map(groupBlock).join('\n\n') : 'No errors recorded.';
  return clean([...head, body].join('\n'));
}
