import { SPRITE_SVG } from './sprite';

/** Hidden SVG sprite of the design system: render once at the root, then use <Icon>/<Glyph>. */
export function IconSprite() {
  // The string is a constant of the bundle (generated from design/sistema/shell.js), never user data.
  return <div hidden dangerouslySetInnerHTML={{ __html: SPRITE_SVG }} />;
}

interface IconProps {
  /** Icon id without prefix, for example `search` (symbol `i-search`). */
  name: string;
  className?: string;
}

/** 16 px icon of the activity bar, buttons and palette. */
export function Icon({ name, className = 'ic' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** 12 px glyph: semantic states (`s-reading`…), agent shapes (`a-claude`…). */
export function Glyph({ name, className = 'g' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
