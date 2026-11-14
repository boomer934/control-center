// Settings (P1): general, appearance, models, privacy, shortcuts, about; invalid value inline.
// Each state is one section, so every section has its own screenshot.
(function () {
  'use strict';
  const L = window.LIVE;
  const SECTIONS = ['General', 'Appearance', 'Models', 'Privacy', 'Shortcuts', 'About'];
  const nav = (cur) =>
    `<div class="col" style="width: calc(var(--sp-10) * 4); flex: none; padding: var(--sp-4) var(--sp-3); border-right: var(--sz-hair) solid var(--line)">${SECTIONS.map(
      (s) =>
        `<div class="lrow${s === cur ? ' sel' : ''}" style="font-family: var(--font-sans)"><span class="p" style="font-family: var(--font-sans)">${s}</span></div>`,
    ).join('')}</div>`;
  const set = (label, hint, control) =>
    `<div class="row" style="justify-content: space-between; gap: var(--sp-6); padding: var(--sp-4) 0; border-bottom: var(--sz-hair) solid var(--line)"><div class="col" style="gap: var(--sp-1); min-width: 0"><span style="font-size: var(--fs-m)">${label}</span>${hint ? `<span class="muted" style="font-size: var(--fs-xs)">${hint}</span>` : ''}</div><div class="row" style="flex: none">${control}</div></div>`;
  const sw = (on) => `<span class="switch${on ? ' on' : ''}"></span>`;
  const seg = (vals, cur) =>
    `<span class="seg">${vals.map((v) => `<span aria-pressed="${v === cur}">${v}</span>`).join('')}</span>`;
  const inp = (v, w = 5, cls = '') =>
    `<div class="input${cls}" style="width: calc(var(--sp-10) * ${w})"><span class="mono">${v}</span></div>`;
  const page = (cur, title, body) =>
    `<div class="tb"><span class="tool"><b>Settings</b></span><span class="tool"><i data-ic="search"></i><span class="muted">Search settings</span></span><span class="r"><span class="tool"><i data-ic="ext"></i>Open settings.json</span></span></div><div class="body">${nav(cur)}<div class="col grow" style="padding: var(--sp-5) var(--sp-8); min-height: 0; max-width: calc(var(--sp-10) * 18)"><h2 style="font-size: var(--fs-l); font-weight: var(--fw-semibold)">${title}</h2>${body}</div></div>`;

  const general = page(
    'General',
    'General',
    [
      set('Open last workspace on start', '', sw(true)),
      set(
        'Claude CLI',
        'Found on PATH · 2.4.1 · logged in',
        `${inp('claude', 4)}<button class="btn ghost">Check again</button>`,
      ),
      set(
        'Default permission mode',
        'What Claude may do without asking',
        seg(['ask', 'accept edits', 'plan'], 'ask'),
      ),
      set(
        'Checkpoint before the first write',
        'A restorable snapshot of the working tree',
        sw(true),
      ),
      set('Windows notifications', 'Permission requests, stopped agents, finished tasks', sw(true)),
      set(
        'Setup',
        'Project, Claude Code, Docker and Ollama',
        '<button class="btn">Run setup again</button>',
      ),
    ].join(''),
  );
  const appearance = page(
    'Appearance',
    'Appearance',
    [
      set(
        'Theme',
        'Follows Windows unless you pick one',
        seg(['system', 'dark', 'light'], 'system'),
      ),
      set(
        'Density',
        'Compact fits 4+ agents on a 1080p screen',
        seg(['compact', 'comfortable'], 'compact'),
      ),
      set(
        'Reduce motion',
        'Off follows Windows. On stops pulses and edge flow',
        seg(['system', 'on', 'off'], 'system'),
      ),
      set('Map labels', 'File names on nodes', seg(['always', 'on hover'], 'always')),
      set(
        'Font size',
        '',
        `<button class="btn ghost">−</button><span class="mono">13 px</span><button class="btn ghost">+</button>`,
      ),
    ].join(''),
  );
  const models = page(
    'Models',
    'Models',
    [
      set(
        'Claude model',
        'Passed to claude --model',
        seg(['default', 'opus', 'sonnet', 'haiku'], 'default'),
      ),
      set(
        'Ollama URL',
        'Local only. Nothing leaves this machine',
        inp('http://127.0.0.1:11434', 6),
      ),
      set(
        'Default local model',
        'Used by quick commands and !',
        `${inp('qwen2.5-coder:14b', 5)}<span class="tag state s-running"><i data-g="s-running"></i>loaded</span>`,
      ),
      set('Warn when a model exceeds VRAM', '12 GB detected on NVIDIA RTX 4070', sw(true)),
      set('Keep local models loaded', 'Unload after this many idle minutes', inp('10', 2)),
    ].join(''),
  );
  const privacy = page(
    'Privacy',
    'Privacy',
    `<div class="banner" style="border: var(--sz-hair) solid var(--line); border-radius: var(--r-2); margin-top: var(--sp-3)"><i data-ic="lock" class="g"></i><span><b>Nothing is sent anywhere by this app.</b> No telemetry, no crash reports. Claude Code talks to Anthropic as it does in your terminal; local agents stay on this PC.</span></div>${[
      set(
        'Record sessions for replay',
        'JSONL files in %APPDATA%\\Control Center\\sessions',
        sw(true),
      ),
      set('Keep recordings for', '', inp('30 days', 3)),
      set(
        'Hide secrets in events and logs',
        'Masks tokens, keys and .env values before they are stored',
        sw(true),
      ),
      set(
        'Recorded sessions',
        '41 files · 212 MB',
        '<button class="btn ghost"><i data-ic="folder"></i>Show folder</button><button class="btn danger">Delete all…</button>',
      ),
    ].join('')}`,
  );
  const sc = (k, a, scope) =>
    `<tr><td>${a}</td><td><span class="kbd">${k}</span></td><td class="muted">${scope}</td></tr>`;
  const shortcuts = page(
    'Shortcuts',
    'Shortcuts',
    `<table class="tbl" style="margin-top: var(--sp-4)"><thead><tr><th style="width: 50%">Action</th><th>Keys</th><th>Where</th></tr></thead><tbody>${[
      ['Ctrl+K', 'Command palette', 'everywhere'],
      ['Ctrl+L', 'Focus the task input', 'everywhere'],
      ['Ctrl+Shift+A', 'Go to the waiting request', 'everywhere'],
      ['Enter / Esc', 'Approve / deny a permission', 'permission dialog'],
      ['F', 'Follow the active agent', 'Live'],
      ['R', 'Human / raw view', 'Live, inspector'],
      ['Ctrl+1 … 5', 'Switch section', 'everywhere'],
      ['Ctrl+J', 'Toggle the bottom dock', 'everywhere'],
      ['Ctrl+O', 'Open a project', 'everywhere'],
    ]
      .map(([k, a, w]) => sc(k, a, w))
      .join(
        '',
      )}</tbody></table><p class="muted" style="font-size: var(--fs-xs); padding-top: var(--sp-3)">Shortcuts can be changed in settings.json. Conflicts are shown here.</p>`,
  );
  const invalid = page(
    'Models',
    'Models',
    [
      set(
        'Claude model',
        'Passed to claude --model',
        seg(['default', 'opus', 'sonnet', 'haiku'], 'default'),
      ),
      `<div class="field" style="padding: var(--sp-4) 0; border-bottom: var(--sz-hair) solid var(--line)"><label>Ollama URL</label>${inp('http://192.168.1.40:11434', 6, ' invalid')}<span class="msg-err"><i data-g="s-error"></i>Only addresses on this machine are allowed (127.0.0.1 or localhost). The previous value is still in use.</span></div>`,
      set('Default local model', 'Used by quick commands and !', inp('qwen2.5-coder:14b', 5)),
      set('Keep local models loaded', '', inp('10', 2)),
    ].join(''),
  );

  const st = (center) => ({
    ...L.normal,
    noDock: true,
    chrome: { ...L.normal.chrome, act: { current: 'settings' } },
    center,
  });
  window.PAGE = { id: 'settings', name: 'Settings', defaultState: 'general' };
  window.LIVE = {
    general: st(general),
    appearance: st(appearance),
    models: st(models),
    privacy: st(privacy),
    shortcuts: st(shortcuts),
    invalid: st(invalid),
  };
})();
