// Infra (P1): Docker, ports, GPU and Ollama. Three independent panels: one can load or be
// missing while the others work. Missing Docker, GPU or Ollama is neutral, never an error.
(function () {
  'use strict';
  const L = window.LIVE;
  const tb = (extra = '') =>
    `<div class="tb"><span class="tool"><b>Infra</b></span><span class="tool"><i data-ic="search"></i><span class="muted">Filter containers and ports</span><span class="kbd">/</span></span>${extra}<span class="r"><span class="tool"><i data-ic="refresh"></i>Refresh</span></span></div>`;
  const st = (s, t) => `<span class="row"><i data-g="s-${s}" class="g st-c s-${s}"></i>${t}</span>`;
  const panel = (h, sub, body, style = 'flex: 1; min-height: 0') =>
    `<div class="panel" style="${style}"><div class="ph">${h}<span class="muted">${sub}</span></div><div class="pb flush">${body}</div></div>`;
  const table = (head, rows) =>
    `<table class="tbl"><thead><tr>${head.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${h.replace('#', '')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  const tr = (cells, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}>${cells.map((c) => (typeof c === 'object' ? `<td class="${c.c}">${c.v}</td>` : `<td>${c}</td>`)).join('')}</tr>`;
  const mono = (v) => ({ c: 'mono', v });
  const num = (v) => ({ c: 'num', v });
  const stop = '<span class="icon-btn" title="Stop… (asks first)"><i data-ic="stop"></i></span>';

  const containers = (rows) => table(['Container', 'Image', 'Ports', '#CPU', '#Memory', ''], rows);
  const c4 = [
    tr([st('running', 'api'), mono('acme/api:dev'), mono('3000'), num('4%'), num('212 MB'), stop]),
    tr(
      [st('running', 'postgres'), mono('postgres:17'), mono('5432'), num('1%'), num('96 MB'), stop],
      'sel',
    ),
    tr([st('running', 'redis'), mono('redis:8'), mono('6379'), num('0%'), num('11 MB'), stop]),
    tr([
      st('running', 'mailpit'),
      mono('axllent/mailpit'),
      mono('8025'),
      num('0%'),
      num('24 MB'),
      stop,
    ]),
  ].join('');
  const by = (code, ag, where, t) =>
    `<span class="row"><i data-sig="${code} ${ag} ${where}"></i><span class="muted">${t}</span></span>`;
  const ports = (rows) => table(['Port', 'Process', 'Owner'], rows);
  const p5 = [
    tr([mono('3000'), 'node', '<span class="muted">container api</span>']),
    tr([mono('5173'), 'node (vite)', by('CL', 'claude', 'cloud', 'npm run dev')]),
    tr([mono('5432'), 'postgres', '<span class="muted">container postgres</span>']),
    tr([mono('6379'), 'redis', '<span class="muted">container redis</span>']),
    tr([mono('11434'), 'ollama', '<span class="muted">Ollama</span>']),
  ].join('');
  const gpu = (vram, pct, model, extra = '') =>
    `<div class="pb col" style="gap: var(--sp-4)"><div class="tm"><span class="k">VRAM · NVIDIA RTX 4070</span><span class="big">${vram} <small>/ 12 GB</small></span><span class="bar local"><i style="width: ${pct}%"></i></span><span class="sub">GPU <b>31%</b> · <b>46 °C</b> · driver <b>581.42</b></span></div>${model}${extra}</div>`;
  const loaded = (n, size, ctx) =>
    `<div class="lrow"><i data-sig="QW local local"></i><span class="p">${n}</span><span class="d">${size} · ctx ${ctx}</span><span class="icon-btn" title="Unload"><i data-ic="x"></i></span></div>`;
  const ollamaOk = `<div class="sect-h">Ollama 0.9.2 · loaded</div>${loaded('qwen2.5-coder:14b', '8.7 GB', '16k')}`;
  const grid = (left, right) =>
    `<div class="body" style="gap: var(--sp-4); padding: var(--sp-4)"><div class="col grow" style="min-height: 0">${left}</div><div class="col" style="width: calc(var(--agents-w) * 1.4); flex: none; min-height: 0">${right}</div></div>`;
  const neutral = (icon, h, p, btns) =>
    `<div class="empty" style="padding: var(--sp-6)"><i data-ic="${icon}" class="g"></i><h2>${h}</h2><p>${p}</p><div class="row">${btns}</div></div>`;
  const chrome = (base, o = {}) => ({
    ...base.chrome,
    title: { ...base.chrome.title, session: undefined },
    act: { current: 'infra' },
    status: { ...base.chrome.status, ...o },
  });
  const skelRows = (n) => `<div class="pb col">${'<i class="skel cell"></i>'.repeat(n)}</div>`;

  const normalCenter = `${tb()}${grid(
    panel('Docker', '4 containers · Docker Desktop 4.48', containers(c4)),
    panel('Ports', '5 listening', ports(p5), 'flex: none') +
      `<div class="panel" style="flex: 1; min-height: 0"><div class="ph">GPU &amp; Ollama<span class="muted">local</span></div>${gpu('9.1', 76, ollamaOk)}</div>`,
  )}`;

  // dense: 30 containers grouped by compose project, 50 ports filtered to "this project"
  const denseContainers = (() => {
    const grp = (name, n, rows) =>
      `<tr class="grp"><td colspan="6"><span class="row"><i data-ic="${rows ? 'chev' : 'chev-r'}" class="g"></i>${name} · ${n}</span></td></tr>${rows}`;
    const svc = ['api', 'worker', 'scheduler', 'postgres', 'redis', 'minio', 'mailpit', 'nginx'];
    const rows = svc
      .map((s, i) =>
        tr([
          st(i === 1 ? 'error' : 'running', s),
          mono(`acme/${s}:dev`),
          mono(i === 1 ? '—' : String(3000 + i)),
          num(`${(i * 7) % 23}%`),
          num(`${40 + i * 31} MB`),
          stop,
        ]),
      )
      .join('');
    return containers(
      grp('acme-api', 8, rows) +
        grp('billing-svc', 9, '') +
        grp('legacy-crm', 7, '') +
        grp('no project', 6, ''),
    );
  })();
  const densePorts = ports(
    [
      tr([mono('3000'), 'node', '<span class="muted">container api</span>']),
      tr([mono('3001'), 'node', '<span class="muted">container worker</span>']),
      tr([mono('5173'), 'node (vite)', by('CL', 'claude', 'cloud', 'npm run dev')]),
      tr([mono('5432'), 'postgres', '<span class="muted">container postgres</span>']),
      tr([mono('6006'), 'node (storybook)', by('EX', 'sub', 'cloud', 'npx storybook')]),
      tr([mono('6379'), 'redis', '<span class="muted">container redis</span>']),
      tr([mono('9000'), 'minio', '<span class="muted">container minio</span>']),
      tr([mono('11434'), 'ollama', '<span class="muted">Ollama</span>']),
    ].join(''),
  );

  window.PAGE = { id: 'infra', name: 'Infra', defaultState: 'normal' };
  window.LIVE = {
    loading: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal, { docker: '4 up', vram: undefined }),
      center: `${tb()}${grid(
        panel('Docker', '4 containers', containers(c4)),
        `<div class="panel" style="flex: none"><div class="ph">Ports<span class="muted"></span></div>${skelRows(4)}</div><div class="panel" style="flex: 1; min-height: 0"><div class="ph">GPU &amp; Ollama</div><div class="pb col"><i class="skel line"></i><i class="skel line" style="width: 60%"></i><span class="loading-note"><span class="prog run"></span>Asking nvidia-smi and Ollama…</span></div></div>`,
      )}`,
    },
    normal: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: normalCenter,
    },
    dense: {
      ...L.dense,
      noDock: true,
      chrome: chrome(L.dense, { docker: '30 up' }),
      center: `${tb('<span class="tool"><i data-ic="filter"></i>Group <b>by project</b></span><span class="tool"><span class="tag filter" aria-pressed="true">this project</span><span class="tag filter" aria-pressed="false">all</span></span>')}${grid(
        panel('Docker', '30 containers · 1 restarting · 3 groups collapsed', denseContainers),
        panel('Ports', '8 of 50 · this project', densePorts, 'flex: none') +
          `<div class="panel" style="flex: 1; min-height: 0"><div class="ph">GPU &amp; Ollama<span class="muted">local</span></div>${gpu('11.4', 95, `${ollamaOk}${loaded('nomic-embed-text', '0.3 GB', '8k')}`, '<div class="banner"><i data-g="s-waiting" class="g st-c s-waiting"></i><span>VRAM almost full: a larger model would spill to the CPU.</span></div>')}</div>`,
      )}`,
    },
    error: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal, { docker: 'off', vram: undefined, local: undefined }),
      center: `${tb()}${grid(
        panel(
          'Docker',
          'not running',
          neutral(
            'box',
            'Docker is not running',
            'Containers show up here when Docker Desktop is running. Ports and local agents keep working without it.',
            '<button class="btn">How to start Docker Desktop</button><button class="btn ghost">Hide Docker</button>',
          ),
        ),
        panel(
          'Ports',
          '4 listening',
          ports(p5.replace(/<tr><td class="mono">11434[\s\S]*?<\/tr>/, '')),
          'flex: none',
        ) +
          `<div class="panel" style="flex: 1; min-height: 0"><div class="ph">GPU &amp; Ollama<span class="muted">local</span></div><div class="pb col" style="gap: var(--sp-4)"><div class="check-row"><i data-ic="gpu" class="g"></i><div class="tx"><b>No NVIDIA GPU found</b><span>VRAM is not available. Ollama can still run models on the CPU, more slowly.</span></div></div><div class="check-row"><i data-ic="chip" class="g"></i><div class="tx"><b>Ollama is not reachable</b><span>Nothing answers on 127.0.0.1:11434.</span></div><button class="btn">How to install</button><button class="btn ghost"><i data-ic="refresh"></i>Retry</button></div></div></div>`,
      )}`,
    },
    offline: {
      ...L.offline,
      noDock: true,
      chrome: chrome(L.offline),
      center: normalCenter.replace(
        '<span class="r">',
        '<span class="tool muted"><i data-ic="offline" class="g"></i>Offline · everything here is local</span><span class="r">',
      ),
    },
  };
})();
