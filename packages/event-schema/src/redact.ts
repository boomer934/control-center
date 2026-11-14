// Secret redaction shared by the normalizers (no secret may reach an AgentEvent) and by the fixture
// sanitizer in scripts/fixtures/sanitize.mjs, which imports this file directly (Node strips the
// types). Keep it dependency-free and limited to erasable TypeScript syntax.

export interface SecretPattern {
  /** Short label used in the placeholder: `<redacted:label>`. */
  label: string;
  regex: RegExp;
  /**
   * Capture group holding the secret value. When set, only that group is replaced and the rest
   * of the match (a `key=` prefix, a `Bearer ` scheme) is kept for readability.
   */
  group?: number;
}

/** Every pattern is global: callers must not rely on `lastIndex` between calls. */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    label: 'private-key',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  },
  { label: 'anthropic-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: 'openai-key', regex: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g },
  {
    label: 'github-token',
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g,
  },
  { label: 'aws-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: 'google-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'slack-token', regex: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'npm-token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  {
    label: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  { label: 'bearer', regex: /\b(Bearer\s+)([A-Za-z0-9._~+/-]{16,}=*)/gi, group: 2 },
  {
    label: 'url-credentials',
    regex: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]{3,})(?=@)/gi,
    group: 2,
  },
  {
    label: 'assignment',
    regex:
      /\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?key|secret|token|passw(?:or)?d|pwd|auth)(?:[_-][A-Za-z0-9]+)*["']?\s*[:=]\s*["']?)([^\s"'`,;]{8,})/gi,
    group: 2,
  },
];

/** True when the string already is one of our placeholders, so it is never redacted twice. */
const isPlaceholder = (s: string) => /^<redacted(?::[a-z-]+)?>$/.test(s);

/** Replaces every secret found in `text` with `<redacted:label>`. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const { label, regex, group } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    out = out.replace(regex, (...args: unknown[]) => {
      const match = args[0] as string;
      if (group === undefined) return `<redacted:${label}>`;
      const value = args[group] as string | undefined;
      if (!value || isPlaceholder(value)) return match;
      const prefix = match.slice(0, match.length - value.length);
      return `${prefix}<redacted:${label}>`;
    });
  }
  return out;
}

/** Finds the secrets in `text` without changing it (used by the fixture check). */
export function findSecrets(text: string): { label: string; index: number }[] {
  const found: { label: string; index: number }[] = [];
  for (const { label, regex, group } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of text.matchAll(regex)) {
      const value = group === undefined ? m[0] : m[group];
      if (!value || isPlaceholder(value) || value.startsWith('<redacted')) continue;
      found.push({ label, index: m.index ?? 0 });
    }
  }
  return found;
}
