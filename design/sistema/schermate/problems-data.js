// Problems (Console Errori) in the bottom dock (F7): empty, normal, dense.
(function () {
  'use strict';
  const L = window.LIVE;
  const tabs = (n) =>
    `<div class="tabs"><span><i data-ic="term" class="g"></i>Terminal</span><span><i data-ic="logs" class="g"></i>Logs</span><span aria-selected="true"><i data-g="s-error" class="g ${n ? 'st-c s-error' : ''}"></i>Problems <span class="n">${n || ''}</span></span>
      <span class="r"><span class="tag filter" aria-pressed="true">All sources</span><span class="tag filter" aria-pressed="false">App</span><span class="tag filter" aria-pressed="false">Project</span><span class="tag filter" aria-pressed="false">Bridge</span><span class="icon-btn"><i data-ic="x"></i></span></span></div>`;
  const prob = (o) =>
    `<div class="prob${o.open ? ' open' : ''}"><div class="ph"><i data-ic="${o.open ? 'chev' : 'chev-r'}" class="g"></i><i data-g="s-error"></i><span class="ell">${o.msg}</span>${o.n ? `<span class="count">×${o.n}</span>` : ''}<span class="src">${o.src}</span><span class="t">${o.t}</span></div>${o.body || ''}</div>`;
  const stack = `<div class="stack"><div class="msgline">TypeError: Cannot read properties of undefined (reading 'id') at parse (src/schema/client.ts:43:18)</div>
    <div class="fr own sel"><span class="loc">src/schema/client.ts:43</span><span>parse</span></div><div class="fr own"><span class="loc">src/schema/client.ts:12</span><span>load</span></div><div class="fr own"><span class="loc">test/schema.test.ts:41</span><span>&lt;anonymous&gt;</span></div><div class="fr"><span class="fold">12 frames in node_modules · show</span></div>
    <div class="row" style="padding-top: var(--sp-3)"><button class="btn"><i data-ic="ext"></i>Open in editor</button><button class="btn"><i data-ic="eye"></i>Show on map</button><button class="btn"><i data-ic="sparkle"></i>Ask Claude to fix</button><button class="btn"><i data-ic="chip"></i>Explain locally</button><button class="btn ghost"><i data-ic="copy"></i>Copy report</button></div></div>`;
  const dock = (n, body) =>
    `<div class="bdock tall">${tabs(n)}<div class="content" style="flex-direction: column">${body}</div></div>`;
  const list = [
    prob({
      open: true,
      msg: "TypeError: Cannot read properties of undefined (reading 'id')",
      n: 3,
      src: 'vitest · project',
      t: '14:08',
      body: stack,
    }),
    prob({
      msg: 'Bridge pipe \\\\.\\pipe\\cc-bridge unreachable · Live continues from stream-json',
      src: 'bridge',
      t: '14:02',
    }),
  ].join('');
  const many = [
    ['ECONNREFUSED 127.0.0.1:5432 · postgres not ready', 41, 'api · project'],
    ["TypeError: Cannot read properties of undefined (reading 'id')", 12, 'vitest · project'],
    ['Unhandled promise rejection in queue worker: job 8812 timed out', 9, 'api · project'],
    ['Hook payload failed validation: missing tool_input (schemaVersion 1)', 7, 'bridge'],
    ['Ollama request aborted: model unloaded while generating', 4, 'local agents'],
    ['Renderer: ResizeObserver loop completed with undelivered notifications', 31, 'app'],
    ['Docker events stream reconnected', 2, 'infra'],
  ];

  window.PAGE = { id: 'problems', name: 'Problems', defaultState: 'normal' };
  window.LIVE = {
    empty: {
      ...L.normal,
      bdock: dock(
        0,
        '<div class="empty positive" style="padding: var(--sp-6)"><i data-g="s-done"></i><h2>No problems</h2><p>Errors from the app, the bridge and your project\'s processes are grouped here, with the stack and a way out.</p></div>',
      ),
    },
    normal: {
      ...L.error,
      bdock: dock(2, list),
    },
    dense: {
      ...L.dense,
      chrome: { ...L.dense.chrome, status: { ...L.dense.chrome.status, errors: 106 } },
      bdock: dock(
        106,
        `<div class="row" style="padding: var(--sp-2) var(--sp-5); border-bottom: var(--sz-hair) solid var(--line); font-size: var(--fs-xs)"><span class="muted">106 problems in 7 groups · project frames highlighted, node_modules collapsed</span><span class="push input" style="height: var(--sz-ctl); width: calc(var(--sp-10) * 5)"><i data-ic="search" class="g"></i><span class="ph">Filter</span></span></div>${many.map(([m, n, s], i) => prob({ msg: m, n, src: s, t: `14:${String(30 - i * 3).padStart(2, '0')}` })).join('')}`,
      ),
    },
  };
})();
