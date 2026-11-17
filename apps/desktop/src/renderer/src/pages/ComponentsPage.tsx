import { useState } from 'react';
import { Glyph, Icon } from '../ui/icons';
import {
  Badge,
  Button,
  Check,
  Field,
  FilterTag,
  IconButton,
  Kbd,
  Sigil,
  StateTag,
  Switch,
  Tag,
  TextInput,
  type SemanticState,
} from '../ui/primitives';

const STATES: SemanticState[] = [
  'idle',
  'reading',
  'writing',
  'running',
  'waiting',
  'error',
  'done',
];

/**
 * Internal page with every base component and all its states. The visual tests take their
 * screenshots here, so nothing on it moves or depends on data.
 */
export function ComponentsPage() {
  const [filters, setFilters] = useState({ errors: true, warnings: false });
  const [sw, setSw] = useState(true);
  const [chk, setChk] = useState(true);

  return (
    <div className="gallery" data-testid="components-page">
      <h1 className="gallery-title">Components</h1>

      <section id="states" data-testid="gal-states" aria-labelledby="gal-states-h">
        <h2 id="gal-states-h">Semantic states</h2>
        <div className="gal-row">
          {STATES.map((s) => (
            <StateTag key={s} state={s} />
          ))}
        </div>
      </section>

      <section id="agents" data-testid="gal-agents" aria-labelledby="gal-agents-h">
        <h2 id="gal-agents-h">Agent sigils</h2>
        <div className="gal-row">
          <Sigil code="CL" agent="claude" />
          <Sigil code="C2" agent="claude" />
          <Sigil code="EX" agent="sub" />
          <Sigil code="QW" agent="local" />
        </div>
      </section>

      <section id="buttons" data-testid="gal-buttons" aria-labelledby="gal-buttons-h">
        <h2 id="gal-buttons-h">Buttons: default · hover · focus · disabled</h2>
        <div className="gal-col">
          <div className="gal-row">
            <Button variant="primary">
              Approve <Kbd>Enter</Kbd>
            </Button>
            <Button variant="primary" forceState="hover">
              Approve
            </Button>
            <Button variant="primary" forceState="focus">
              Approve
            </Button>
            <Button variant="primary" disabled>
              Approve
            </Button>
          </div>
          <div className="gal-row">
            <Button>
              Deny <Kbd>Esc</Kbd>
            </Button>
            <Button forceState="hover">Deny</Button>
            <Button forceState="focus">Deny</Button>
            <Button disabled>Deny</Button>
          </div>
          <div className="gal-row">
            <Button variant="ghost">
              <Icon name="copy" />
              Copy report
            </Button>
            <Button variant="ghost" forceState="hover">
              <Icon name="copy" />
              Copy report
            </Button>
            <Button variant="ghost" forceState="focus">
              <Icon name="copy" />
              Copy report
            </Button>
            <Button variant="ghost" disabled>
              <Icon name="copy" />
              Copy report
            </Button>
          </div>
          <div className="gal-row">
            <Button variant="danger">
              <Icon name="restore" />
              Restore 4 files
            </Button>
            <Button variant="danger" forceState="focus">
              Discard
            </Button>
            <Button variant="danger" disabled>
              Discard
            </Button>
            <Button large variant="primary">
              Finish
            </Button>
            <IconButton label="Fit" pressed={false}>
              <Icon name="fit" />
            </IconButton>
            <IconButton label="Follow" pressed>
              <Icon name="follow" />
            </IconButton>
          </div>
        </div>
      </section>

      <section id="kbd" data-testid="gal-kbd" aria-labelledby="gal-kbd-h">
        <h2 id="gal-kbd-h">Kbd</h2>
        <div className="gal-row">
          <Kbd>Ctrl+K</Kbd>
          <Kbd>Ctrl+Shift+P</Kbd>
          <Kbd>Enter</Kbd>
          <Kbd>Esc</Kbd>
        </div>
      </section>

      <section id="inputs" data-testid="gal-inputs" aria-labelledby="gal-inputs-h">
        <h2 id="gal-inputs-h">Inputs: default · focus · invalid · disabled</h2>
        <div className="gal-row gal-top">
          <Field label="Ollama URL" hint="Local only. Nothing leaves this machine.">
            <TextInput defaultValue="http://127.0.0.1:11434" aria-label="Ollama URL" />
          </Field>
          <Field label="Search">
            <TextInput icon="search" forceFocus defaultValue="schema" aria-label="Search" />
          </Field>
          <Field label="Scrollback lines" error="Must be between 1,000 and 100,000.">
            <TextInput invalid defaultValue="-200" aria-label="Scrollback lines" />
          </Field>
          <Field label="Session model">
            <TextInput
              disabled
              placeholder="Offline: Claude unavailable"
              aria-label="Session model"
            />
          </Field>
        </div>
        <div className="gal-row">
          <Switch checked={sw} onChange={setSw} label="Switch" />
          <Switch checked={false} onChange={() => undefined} label="Switch off" />
          <Check checked={chk} onChange={setChk} label="Check" />
          <Check checked={false} onChange={() => undefined} label="Check off" />
        </div>
      </section>

      <section id="chips" data-testid="gal-chips" aria-labelledby="gal-chips-h">
        <h2 id="gal-chips-h">Tags and chips</h2>
        <div className="gal-row">
          <Tag kind="live">Live 2:14</Tag>
          <Tag kind="cp">
            <Glyph name="i-flag" />
            cp-3 · before edit
          </Tag>
          <FilterTag
            pressed={filters.errors}
            onToggle={() => setFilters((f) => ({ ...f, errors: !f.errors }))}
          >
            Errors
          </FilterTag>
          <FilterTag
            pressed={filters.warnings}
            onToggle={() => setFilters((f) => ({ ...f, warnings: !f.warnings }))}
          >
            Warnings
          </FilterTag>
          <Tag kind="neutral">
            <Glyph name="i-box" />
            Docker off
          </Tag>
          <Tag kind="mono">claude-opus-5-5</Tag>
          <Badge>3</Badge>
          <Badge error>2</Badge>
        </div>
      </section>
    </div>
  );
}
