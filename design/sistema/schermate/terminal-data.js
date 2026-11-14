// Terminal (P1) in the bottom dock: one shell in the workspace folder, several shells,
// long output with scrollback limit and search, shell that cannot start.
(function () {
  'use strict';
  const L = window.LIVE;
  const tabs = (r = '') =>
    `<div class="tabs"><span aria-selected="true"><i data-ic="term" class="g"></i>Terminal</span><span><i data-ic="logs" class="g"></i>Logs</span><span><i data-ic="alert" class="g"></i>Problems</span><span class="r">${r}<span class="icon-btn" title="New terminal"><i data-ic="plus"></i></span><span class="icon-btn" title="Close dock"><i data-ic="x"></i></span></span></div>`;
  const dock = (body, r) =>
    `<div class="bdock tall">${tabs(r)}<div class="content">${body}</div></div>`;
  const list = (rows) =>
    `<div class="col" style="width: calc(var(--sp-10) * 6); flex: none; gap: 0; padding: var(--sp-2); border-left: var(--sz-hair) solid var(--line); background: var(--bg-2)">${rows}</div>`;
  const sh = (n, d, sel, s = 'idle') =>
    `<div class="lrow${sel ? ' sel' : ''}"><i data-g="s-${s}" class="g st-c s-${s}"></i><span class="p">${n}</span><span class="d">${d}</span></div>`;
  const P = '<span class="p">PS C:\\code\\acme-api&gt;</span>';
  const one = `<div class="term">${P} <span class="cursor"></span></div>`;
  const many = `<div class="term">${P} npm run dev

&gt; acme-api@0.4.0 dev
&gt; vite

  <span class="ok">VITE v7.1.2  ready in 412 ms</span>

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
<span class="p">14:06:12</span> [vite] hmr update /src/schema/client.ts
<span class="p">14:08:40</span> [vite] hmr update /src/schema/types.ts <span class="cursor"></span></div>`;
  const shells = list(
    `${sh('pwsh', 'acme-api')}${sh('npm run dev', ':5173 · Claude', true, 'running')}${sh('vitest --watch', '2 failing', false, 'error')}`,
  );
  const dense = `<div class="term"><span class="p">… 48,000 earlier lines dropped · scrollback keeps the last 10,000</span>
[api] GET /health 200 2ms
[api] GET /v1/schema 200 14ms
[worker] job 8811 done in 412ms
[api] GET /v1/schema 500 3ms
[api] <span class="hl">ECONNREFUSED</span> 127.0.0.1:5432
[worker] retry 1/5 in 2s
[api] GET /v1/schema 500 2ms
[api] <span class="hl">ECONNREFUSED</span> 127.0.0.1:5432
[worker] retry 2/5 in 4s
[api] GET /health 200 1ms</div>`;
  const find =
    '<span class="input is-focus" style="height: var(--sz-ctl); width: calc(var(--sp-10) * 5); margin: auto var(--sp-3)"><i data-ic="search" class="g"></i><span>ECONNREFUSED</span><span class="muted" style="margin-left: auto">3 of 41</span></span>';

  window.PAGE = { id: 'terminal', name: 'Terminal', defaultState: 'normal' };
  window.LIVE = {
    empty: { ...L.normal, base: 'normal', bdock: dock(one) },
    loading: {
      ...L.normal,
      base: 'normal',
      bdock: dock(
        '<div class="term"><span class="loading-note"><span class="prog run"></span>Starting PowerShell 7 in C:\\code\\acme-api…</span></div>',
      ),
    },
    normal: { ...L.normal, base: 'normal', bdock: dock(many + shells) },
    dense: {
      ...L.dense,
      base: 'dense',
      bdock: dock(
        dense +
          list(
            `${sh('pwsh', 'acme-api')}${sh('docker compose logs -f', '58,000 lines', true, 'running')}${sh('npm run dev', ':5173', false, 'running')}${sh('vitest --watch', '2 failing', false, 'error')}<div class="lrow muted"><i data-ic="chev-r" class="g"></i>3 more</div>`,
          ),
        find,
      ),
    },
    error: {
      ...L.normal,
      base: 'normal',
      chrome: { ...L.normal.chrome, status: { ...L.normal.chrome.status, errors: 1 } },
      bdock: dock(
        '<div class="col" style="padding: var(--sp-5); gap: var(--sp-4)"><div class="row"><i data-g="s-error" class="g st-c s-error"></i><b>The shell did not start</b></div><p class="muted" style="font-size: var(--fs-s)">pwsh.exe was not found. Windows PowerShell 5.1 is available.</p><div class="row"><button class="btn pri">Use Windows PowerShell</button><button class="btn">Choose a shell…</button><button class="btn ghost"><i data-ic="logs"></i>Show log</button></div></div>',
      ),
    },
  };
  // The bottom dock is open in every state: show it pressed in the title bar.
  for (const D of Object.values(window.LIVE)) {
    const t = D.chrome.title || {};
    D.chrome = { ...D.chrome, title: { ...t, docks: { ...(t.docks || {}), bottom: true } } };
  }
})();
