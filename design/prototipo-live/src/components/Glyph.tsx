import type { AgentKind } from '../replay/types';
import type { SemState } from '../replay/state';

/** A 12px state/agent glyph or a 16px icon from the shared sprite (shell.js). */
export function Glyph({ id, className = 'g' }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export const Icon = ({ id }: { id: string }) => <Glyph id={`i-${id}`} className="ic" />;

const AG: Record<AgentKind, string> = { claude: 'a-claude', sub: 'a-sub' };

/** Channel sigil: agent glyph + code + cloud/local mark. Every agent here is a cloud agent. */
export function Sig({ code, kind }: { code: string; kind: AgentKind }) {
  return (
    <span className={`sig ag-${kind}`} title="cloud agent">
      <Glyph id={AG[kind]} />
      {code}
      <Glyph id="k-uplink" className="k" />
    </span>
  );
}

export function StateTag({ state, label }: { state: SemState; label: string }) {
  return (
    <span className={`tag state s-${state}`}>
      <Glyph id={`s-${state}`} />
      {label}
    </span>
  );
}
