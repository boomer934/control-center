import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Glyph, Icon } from './icons';

// Base components of the design system (design/sistema/componenti.html). They emit the class
// names of componenti.css, so every colour, size and duration comes from the tokens.

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  large?: boolean;
  /** Static hover/focus look, for the components page only. */
  forceState?: 'hover' | 'focus';
}

export function Button({
  variant = 'default',
  large,
  forceState,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    variant === 'primary' && 'pri',
    variant === 'ghost' && 'ghost',
    variant === 'danger' && 'danger',
    large && 'lg',
    forceState && `is-${forceState}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={cls} {...rest} />;
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  label: string;
  pressed?: boolean;
}

export function IconButton({
  label,
  pressed,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={['icon-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...rest}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export type TagKind = 'live' | 'cp' | 'neutral' | 'mono';

export function Tag({ kind, children }: { kind?: TagKind; children: ReactNode }) {
  return <span className={['tag', kind].filter(Boolean).join(' ')}>{children}</span>;
}

export function FilterTag({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle(): void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="tag filter" aria-pressed={pressed} onClick={onToggle}>
      {children}
    </button>
  );
}

export function Badge({ children, error }: { children: ReactNode; error?: boolean }) {
  return <span className={error ? 'badge err' : 'badge'}>{children}</span>;
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'switch on' : 'switch'}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'check on' : 'check'}
      onClick={() => onChange(!checked)}
    >
      {checked && <Icon name="check" className="g-s" />}
    </button>
  );
}

interface TextInputProps extends ComponentProps<'input'> {
  invalid?: boolean;
  /** Static focus look, for the components page only. */
  forceFocus?: boolean;
  icon?: string;
}

export function TextInput({ invalid, forceFocus, icon, className, ...rest }: TextInputProps) {
  const cls = ['input', invalid && 'invalid', forceFocus && 'is-focus', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      {icon && <Icon name={icon} />}
      <input aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
}

export type SemanticState =
  'idle' | 'reading' | 'writing' | 'running' | 'waiting' | 'error' | 'done';

export const STATE_LABEL: Record<SemanticState, string> = {
  idle: 'idle',
  reading: 'reading',
  writing: 'writing',
  running: 'running',
  waiting: 'waiting for you',
  error: 'error',
  done: 'done',
};

/** Tag of a semantic state: glyph + word + colour, so it reads in grayscale too. */
export function StateTag({ state, pulse }: { state: SemanticState; pulse?: boolean }) {
  return (
    <span className={`tag state s-${state}${pulse ? ' pulse' : ''}`} data-state={state}>
      <Glyph name={`s-${state}`} />
      {STATE_LABEL[state]}
    </span>
  );
}

export type AgentKind = 'claude' | 'sub' | 'local';

/** Channel sigil: agent glyph, two-letter code and the cloud (uplink) or local (ground) mark. */
export function Sigil({
  code,
  agent,
  where = agent === 'local' ? 'local' : 'cloud',
}: {
  code: string;
  agent: AgentKind;
  where?: 'cloud' | 'local';
}) {
  return (
    <span className={`sig ag-${agent}`} title={`${where} agent`}>
      <Glyph name={`a-${agent}`} />
      {code}
      <Glyph name={where === 'local' ? 'k-ground' : 'k-uplink'} className="k" />
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? (
        <span className="msg-err">{error}</span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </div>
  );
}
