// Onboarding (P1): three skippable steps on first launch. Step 1 project, step 2 Claude Code
// (checking, ok, CLI missing, not logged in), step 3 optional Docker and Ollama (neutral when missing).
(function () {
  'use strict';
  const L = window.LIVE;
  const NAMES = ['Choose a project', 'Check Claude Code', 'Optional: Docker and Ollama'];
  const steps = (n) =>
    `<div class="steps">${NAMES.map((t, i) => `<span${i + 1 === n ? ' aria-current="step"' : i + 1 < n ? ' class="done"' : ''}><i>${i + 1}</i>${t}</span>`).join('')}</div>`;
  const row = (s, icon, b, sub, acts = '') =>
    `<div class="check-row${s === 'error' ? ' s-error' : ''}">${icon || `<i data-g="s-${s}" class="g st-c s-${s}"></i>`}<div class="tx"><b>${b}</b><span>${sub}</span></div>${acts}</div>`;
  const spin = '<span class="prog run" style="position: relative; width: var(--sp-9)"></span>';
  const frame = (n, h, p, body, next, back = n > 1) =>
    `<div class="body" style="align-items: center; justify-content: center; overflow: auto"><div class="col" style="width: calc(var(--dialog-w) + var(--sp-10) * 3); gap: var(--sp-6)">${steps(n)}<div class="col" style="gap: var(--sp-3)"><h1 style="font-size: var(--fs-xl); font-weight: var(--fw-semibold); line-height: var(--lh-tight)">${h}</h1><p class="muted" style="font-size: var(--fs-m); line-height: var(--lh-prose)">${p}</p></div><div class="col" style="gap: var(--sp-3)">${body}</div><div class="row"><button class="btn ghost">Skip setup</button><span class="push row">${back ? '<button class="btn">Back</button>' : ''}${next}</span></div></div></div>`;
  const recent = (n, path, sel) =>
    `<div class="lrow${sel ? ' sel' : ''}"><i data-ic="folder" class="g"></i><span class="p">${n}</span><span class="d">${path}</span></div>`;
  const s1 = (err) =>
    frame(
      1,
      'Choose a project',
      'Control Center watches one folder: its files become the map. Nothing in it is changed until you start a task.',
      `<div class="row"><button class="btn pri"><i data-ic="folder"></i>Open folder… <span class="kbd">Ctrl+O</span></button></div>${
        err
          ? row(
              'error',
              '',
              'D:\\work\\legacy-crm cannot be read',
              'The folder does not exist any more, or Windows denied access.',
              '<button class="btn">Choose another…</button>',
            )
          : ''
      }<div class="sect-h">Recent in VS Code</div>${recent('acme-api', '~/code/acme-api', !err)}${recent('billing-svc', '~/code/billing-svc')}${err ? recent('legacy-crm', 'D:\\work\\legacy-crm', true).replace('class="g"', 'class="g st-c s-error"') : recent('control-center', '~/Desktop/control-center')}`,
      `<button class="btn pri"${err ? ' disabled' : ''}>Continue <span class="kbd">Enter</span></button>`,
    );
  const s2 = (state) => {
    const r = {
      checking: row(
        'idle',
        spin,
        'Checking claude --version…',
        'Looking on PATH and in %APPDATA%\\npm',
      ),
      ok: row(
        'done',
        '',
        'Claude Code 2.4.1 · Logged in',
        'Found at C:\\Users\\you\\AppData\\Roaming\\npm\\claude.cmd. No account details are shown or stored.',
      ),
      missing: row(
        'error',
        '',
        'Claude Code is not installed',
        'claude was not found on PATH. Install it, then come back: local agents work without it.',
        '<button class="btn">How to install</button><button class="btn ghost"><i data-ic="refresh"></i>Retry</button>',
      ),
      login: row(
        'waiting',
        '',
        'Claude Code 2.4.1 · Not logged in',
        'Run claude login once. It opens the browser; the app never sees your credentials.',
        '<button class="btn pri"><i data-ic="term"></i>Run claude login</button><button class="btn ghost"><i data-ic="refresh"></i>Retry</button>',
      ),
    }[state];
    const extra =
      state === 'login'
        ? '<div class="panel"><div class="pb flush"><div class="term" style="flex: none"><span class="p">PS C:\\code\\acme-api&gt;</span> claude login\nOpening the browser to sign in… <span class="cursor"></span></div></div></div>'
        : '';
    return frame(
      2,
      'Check Claude Code',
      'Control Center runs the official claude CLI with your existing login. It does not ask for keys or passwords.',
      r + extra,
      state === 'ok'
        ? '<button class="btn pri">Continue <span class="kbd">Enter</span></button>'
        : '<button class="btn">Continue without Claude</button>',
    );
  };
  const s3 = frame(
    3,
    'Optional: Docker and Ollama',
    'Both are optional. Without them the Infra and Local agents sections stay empty, and nothing else changes.',
    `${row('done', '<i data-ic="box" class="g st-c s-done"></i>', 'Docker Desktop 4.48 · 4 containers running', 'Containers and their ports will show in Infra.')}${row('idle', '<i data-ic="chip" class="g"></i>', 'Ollama not found', 'Local agents need Ollama on this PC. You can add it later.', '<button class="btn ghost">How to install Ollama</button>')}${row('idle', '<i data-ic="gpu" class="g"></i>', 'NVIDIA RTX 4070 · 12 GB VRAM', 'For information: local models up to about 14B fit in memory.')}`,
    '<button class="btn pri">Finish <span class="kbd">Enter</span></button>',
  );
  const st = (center) => ({
    ...L.empty,
    noDock: true,
    chrome: {
      title: { none: true, docks: {} },
      act: { none: true },
      status: { empty: true, ws: '—' },
    },
    center,
  });

  window.PAGE = { id: 'onboarding', name: 'Onboarding', defaultState: 'project' };
  window.LIVE = {
    project: st(s1(false)),
    'project-error': st(s1(true)),
    checking: st(s2('checking')),
    'claude-ok': st(s2('ok')),
    'claude-missing': st(s2('missing')),
    'claude-login': st(s2('login')),
    optional: st(s3),
  };
})();
