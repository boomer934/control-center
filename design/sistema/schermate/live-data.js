// Fake data for live.html: one entry per state. Coordinates are map data (ELK output), not style.
(function () {
  'use strict';
  const N = (x, y, w, n, s, meta, kind) => ({ x, y, w, n, s, meta, kind });
  const DIFF = (a, d) =>
    `<span class="diffbadge"><span class="add">+${a}</span><span class="del">−${d}</span></span>`;
  const TRAIL = '<span class="trail"><i></i><i></i><i></i></span>';

  const tele = (tok, loc, vram, model, split = 'cloud <b>107k</b> · local <b>75k</b>') => `
    <div class="tele">
      <div class="tm"><span class="k">Session tokens</span><span class="big">${tok} <small>/ ${loc} local</small></span><span class="bar local"><i style="width:${loc}"></i></span><span class="sub">${split}</span></div>
      <div class="tm"><span class="k">VRAM</span><span class="big">${vram} <small>/ 12 GB</small></span><span class="bar"><i style="width:${Math.round((parseFloat(vram) / 12) * 100)}%"></i></span><span class="sub"><i data-g="a-local" class="g-s ag-c ag-local"></i><b>${model}</b></span></div>
    </div>`;
  const chg = (rows, more) => `
    <div class="chg"><div class="hd"><b>Changed files</b><span>${rows.length + (more || 0)}</span></div>
      ${rows.map(([p, a, d, s]) => `<div class="r ${s ? `s-${s}` : ''}"><i data-g="s-${s || 'done'}"></i><span class="ell">${p}</span><span class="d"><span class="add">+${a}</span> <span class="del">−${d}</span></span></div>`).join('')}
      ${more ? `<div class="more">${more} more in Git</div>` : ''}</div>`;
  const card = (o) => `
    <div class="card s-${o.s} ag-${o.ag}${o.sel ? ' sel' : ''}">
      <div class="h"><i data-sig="${o.code} ${o.ag} ${o.where || 'cloud'}"></i><span class="nm">${o.n}</span><span class="tag state s-${o.s}"><i data-g="s-${o.s}"></i>${o.label}</span></div>
      ${o.task ? `<div class="task">${o.task}</div>` : ''}${o.now ? `<div class="now">${o.now}</div>` : ''}
      ${o.req ? `<div class="req"><i data-g="s-waiting"></i>Bash <b>${o.req}</b></div><div class="acts"><button class="btn pri">Approve <span class="kbd">Enter</span></button><button class="btn">Deny <span class="kbd">Esc</span></button></div>` : ''}
      ${o.extra || ''}${o.s === 'running' ? '<span class="prog"></span>' : ''}
    </div>`;

  const DOCK_HEAD = (extra = '') =>
    `<div class="dk-h"><b>Session</b><span class="mono">opus-5.5</span>${extra}<span class="r"><span class="icon-btn"><i data-ic="more"></i></span></span></div>`;
  const USER_MSG =
    '<div class="msg user">The schema tests are flaky, they fail about one run in three. Find out why and fix them.</div>';
  const CLAUDE_MSG = (tail) => `
    <div class="msg"><div class="who"><i data-g="a-claude"></i>Claude · 0:04</div>The fetch in <code>client.ts</code> never checks <code>res.ok</code>, so a slow fixture server returns HTML and parsing fails at random. I'll guard it and rerun the tests.
      <div class="trace">
        <div class="s-reading"><i data-g="s-reading" class="g k"></i>Read <b>src/schema/client.ts</b><span class="x">×3</span></div>
        <div class="s-reading"><i data-g="s-reading" class="g k"></i>Grep <b>"res.json" src/</b><span class="x">×2</span></div>
        <div class="s-writing"><i data-g="s-writing" class="g k"></i>Edit <b>src/schema/client.ts</b><span class="x"><span class="add">+12</span> <span class="del">−3</span></span></div>
        <div class="s-writing"><i data-g="s-writing" class="g k"></i>Edit <b>src/schema/types.ts</b><span class="x"><span class="add">+4</span> <span class="del">−1</span></span></div>
        <div class="s-error"><i data-g="s-error" class="g k"></i>Bash <b>npm test -- schema</b><span class="x">2 failing</span></div>
      </div>
    </div>${tail || ''}`;
  const PERM = `
    <div class="perm"><div class="perm-h"><i data-g="s-waiting"></i><span class="t">Claude wants to run a command</span><span class="r">Bash · waiting 0:41</span></div>
      <dl><dt>Command</dt><dd class="cmd">rm -rf dist &amp;&amp; npm run build</dd><dt>Reason</dt><dd class="why">The tests import a stale build of the client from dist/.</dd><dt>Directory</dt><dd>~/code/acme-api</dd></dl>
      <div class="btns"><button class="btn lg pri wide">Approve <span class="kbd">Enter</span></button><button class="btn lg wide">Always this session <span class="kbd">Ctrl+Enter</span></button><button class="btn lg wide">Deny <span class="kbd">Esc</span></button></div></div>`;
  const COMPOSER = (state) => `
    <div class="composer"><div class="ctx"><span class="on"><b>opus-5.5</b></span><span>MCP <b>3</b></span><span>checkpoint <b>auto</b></span></div>
      ${state === 'off' ? '<div class="inp disabled"><span>Claude is unavailable offline. Use <span class="kbd">!</span> in the palette for local agents.</span></div>' : state === 'focus' ? '<div class="inp is-focus"><span>Describe a task for Claude…</span><span class="kbd">Enter</span></div>' : '<div class="inp"><span>Reply or add context…</span><span class="kbd">Ctrl+L</span></div>'}</div>`;

  // ---------- normal ----------
  const normalMap = {
    w: 740,
    h: 360,
    ctr: [
      { x: 10, y: 16, w: 360, h: 196, label: 'src/schema', count: '6 files' },
      { x: 400, y: 16, w: 330, h: 140, label: 'test', count: '4' },
      { x: 10, y: 236, w: 360, h: 84, label: 'src/api', count: '2' },
    ],
    nodes: [
      N(26, 40, 170, 'index.ts', 'reading', 'read ×2'),
      N(26, 68, 170, 'client.ts', 'done', DIFF(12, 3) + TRAIL),
      N(26, 96, 170, 'types.ts', 'done', DIFF(4, 1)),
      N(26, 124, 170, 'parse.ts', 'idle'),
      N(26, 152, 170, 'errors.ts', 'idle'),
      N(26, 180, 170, 'retry.ts', 'idle'),
      N(416, 40, 190, 'schema.test.ts', 'error', '2 failing'),
      N(416, 68, 190, 'client.test.ts', 'idle'),
      N(416, 96, 190, 'fixtures/', 'idle', '12', 'folder'),
      N(416, 124, 190, 'setup.ts', 'idle'),
      N(26, 260, 170, 'routes.ts', 'idle'),
      N(26, 288, 170, 'server.ts', 'idle'),
      N(416, 184, 314, '$ rm -rf dist && npm run build', 'waiting', '0:41', 'temp'),
      N(416, 288, 314, 'qwen · summarize vitest log', 'running', '38 tok/s', 'temp'),
    ],
    chips: [
      {
        x: 212,
        y: 40,
        w: 176,
        ag: 'sub',
        code: 'EX',
        where: 'cloud',
        n: 'Explore',
        s: 'reading',
        label: 'reading',
      },
      {
        x: 560,
        y: 228,
        w: 170,
        ag: 'claude',
        code: 'CL',
        where: 'cloud',
        n: 'Claude',
        s: 'waiting',
        label: 'waits',
      },
      {
        x: 560,
        y: 326,
        w: 170,
        ag: 'local',
        code: 'QW',
        where: 'local',
        n: 'qwen2.5',
        s: 'running',
        label: 'running',
      },
    ],
    edges: [
      {
        cls: 'e-read',
        pts: [
          [212, 50],
          [196, 50],
        ],
        end: 'read',
      },
      {
        cls: 'e-attach w',
        pts: [
          [645, 228],
          [645, 204],
        ],
      },
      {
        cls: 'e-attach',
        pts: [
          [645, 326],
          [645, 308],
        ],
      },
    ],
    readout: [
      ['23', 'nodes'],
      ['7', 'touched'],
      ['3', 'agents'],
    ],
  };
  const normalTl = {
    t0: 0,
    t1: 140,
    now: 134,
    nowLabel: '2:14',
    head: '<span>Timeline</span><span><b>Read ×4</b> · <b>Grep ×2</b> · Edit ×2 · Bash ×1 · 1 waiting</span><span class="r">window <b>2:20</b></span>',
    lanes: [
      {
        name: 'Claude',
        code: 'CL',
        ag: 'claude',
        rows: 2,
        ev: [
          [2, 9, 'rd', 'Read'],
          [10, 16, 'rd', 'Grep'],
          [18, 25, 'rd', 'Read'],
          [30, 44, 'ed', 'client.ts'],
          [46, 55, 'ed', 'types.ts'],
          [58, 92, 'err', '× schema.test.ts · 2 failing'],
          [94, 100, 'rd', 'Read'],
          Object.assign([94, 101, 'rd', 'Grep'], { row: 1 }),
          [104, null, 'wait', 'waits · rm -rf dist'],
        ],
      },
      { name: 'Explore', code: 'EX', ag: 'sub', ev: [[110, null, 'rd', 'Read index.ts']] },
      { name: 'qwen2.5', code: 'QW', ag: 'local', ev: [[82, null, 'run', 'summarize vitest log']] },
    ],
    forks: [{ from: 0, to: 1, t: 107 }],
    cps: [{ t: 28, label: 'cp-3' }],
  };
  const normalAgents = {
    n: 3,
    html: `${tele('182k', '41%', '9.1', 'qwen2.5-coder 14b')}
      <div class="col" style="gap: var(--sp-3); min-height: 0">
        ${card({ s: 'waiting', ag: 'claude', code: 'CL', n: 'Claude', label: '0:41', sel: true, task: 'Fix the flaky schema tests', req: 'rm -rf dist &amp;&amp; npm run build' })}
        ${card({ s: 'reading', ag: 'sub', code: 'EX', n: 'Explore', label: 'reading', now: 'Read <b>src/schema/index.ts</b>' })}
        ${card({ s: 'running', ag: 'local', code: 'QW', where: 'local', n: 'qwen2.5-coder', label: 'running', now: 'Summarize <b>vitest log</b> · 38 tok/s' })}
      </div>
      ${chg([
        ['src/schema/client.ts', 12, 3],
        ['src/schema/types.ts', 4, 1],
      ])}`,
  };
  const chromeNormal = {
    title: { session: 'Fix the flaky schema tests', sessTime: '2:14', docks: { bottom: false } },
    act: { current: 'live', badges: { git: { n: 2 } } },
    status: {
      wait: { what: 'Bash rm -rf dist', t: '0:41' },
      agents: ['claude', 'sub', 'local'],
      session: { t: '2:14', st: 'waiting' },
      tokens: '182k',
      local: '41%',
      changed: 2,
      vram: [9.1, 12],
      docker: '4 up',
    },
  };

  // ---------- dense: generated ----------
  const dense = (() => {
    const nodes = [],
      ctr = [],
      edges = [];
    const files = [
      'index',
      'client',
      'types',
      'parse',
      'errors',
      'retry',
      'cache',
      'auth',
      'routes',
      'server',
      'db',
      'queue',
      'jobs',
      'mail',
      'users',
      'billing',
      'logger',
      'config',
    ];
    const groups = [
      ['src/schema', 0],
      ['src/api', 1],
      ['src/services', 2],
      ['test', 3],
    ];
    const states = {
      'src/schema/client': 'writing',
      'src/schema/index': 'reading',
      'src/api/routes': 'reading',
      'src/services/queue': 'writing',
      'test/schema.test': 'error',
      'src/services/mail': 'done',
      'src/api/auth': 'done',
      'src/schema/types': 'done',
    };
    groups.forEach(([g, gi]) => {
      const gx = 10 + (gi % 2) * 370,
        gy = 16 + Math.floor(gi / 2) * 250;
      ctr.push({ x: gx, y: gy, w: 350, h: 226, label: g, count: `${gi === 3 ? 41 : 28} files` });
      for (let i = 0; i < 14; i++) {
        const col = i % 2,
          row = Math.floor(i / 2);
        const name =
          gi === 3
            ? `${files[(i + gi * 3) % files.length]}.test`
            : files[(i + gi * 4) % files.length];
        const key = `${g}/${name}`;
        const s = states[key] || (i % 5 === 3 ? 'done' : 'idle');
        const meta =
          s === 'writing'
            ? DIFF(8 + i, 2)
            : s === 'error'
              ? '2 failing'
              : s === 'reading'
                ? 'read'
                : '';
        nodes.push(N(gx + 14 + col * 166, gy + 22 + row * 26, 156, `${name}.ts`, s, meta));
      }
      nodes.push(
        N(
          gx + 14,
          gy + 22 + 7 * 26,
          156,
          'generated/',
          'idle',
          '<span class="heat"><i class="h"></i><i class="h"></i><i class="r"></i><i></i><i class="r"></i><i></i></span>34',
          'folder',
        ),
      );
      nodes.push(
        N(
          gx + 180,
          gy + 22 + 7 * 26,
          156,
          'fixtures/',
          'idle',
          '<span class="heat"><i class="r"></i><i></i><i></i><i class="r"></i></span>112',
          'folder',
        ),
      );
    });
    return {
      w: 740,
      h: 500,
      ctr,
      nodes,
      edges,
      chips: [
        {
          x: 200,
          y: 4,
          w: 110,
          ag: 'claude',
          code: 'CL',
          where: 'cloud',
          n: 'Claude',
          s: 'writing',
          label: 'writing',
        },
        {
          x: 570,
          y: 4,
          w: 110,
          ag: 'sub',
          code: 'EX',
          where: 'cloud',
          n: 'Explore',
          s: 'reading',
          label: 'reading',
        },
        {
          x: 200,
          y: 254,
          w: 110,
          ag: 'sub',
          code: 'PL',
          where: 'cloud',
          n: 'Plan',
          s: 'done',
          label: 'done',
        },
        {
          x: 570,
          y: 254,
          w: 110,
          ag: 'sub',
          code: 'E2',
          where: 'cloud',
          n: 'Explore 2',
          s: 'waiting',
          label: 'waits',
        },
        {
          x: 390,
          y: 474,
          w: 130,
          ag: 'local',
          code: 'QW',
          where: 'local',
          n: 'qwen2.5',
          s: 'running',
          label: 'running',
        },
      ],
      readout: [
        ['512', 'nodes'],
        ['138', 'touched'],
        ['5', 'agents'],
        ['21', 'ev/s'],
      ],
    };
  })();
  const denseTl = {
    t0: 0,
    t1: 600,
    now: 590,
    nowLabel: '9:50',
    head: '<span>Timeline</span><span><b>Read ×86</b> · Grep ×31 · Edit ×24 · Bash ×9 · 1 waiting</span><span class="r">window <b>10:00</b> · 21 ev/s</span>',
    lanes: [
      {
        name: 'Claude',
        code: 'CL',
        ag: 'claude',
        rows: 2,
        ev: [
          [10, 60, 'rd', 'Read ×12'],
          [64, 120, 'ed', 'client.ts'],
          [124, 200, 'sh', 'npm test'],
          Object.assign([150, 230, 'rd', 'Grep ×6'], { row: 1 }),
          [240, 300, 'ed', 'queue.ts'],
          [310, 380, 'err', '× schema.test.ts · 2 failing'],
          [390, 470, 'ed', 'client.ts'],
          Object.assign([400, 470, 'rd', 'Read ×9'], { row: 1 }),
          [480, null, 'ed', 'queue.ts'],
        ],
      },
      {
        name: 'Explore',
        code: 'EX',
        ag: 'sub',
        rows: 2,
        ev: [
          [130, 260, 'rd', 'Read ×22'],
          Object.assign([140, 250, 'rd', 'Grep ×8'], { row: 1 }),
          [420, null, 'rd', 'Read routes.ts'],
        ],
      },
      { name: 'Plan', code: 'PL', ag: 'sub', ev: [[200, 330, 'done', 'plan · 7 steps']] },
      {
        name: 'Explore 2',
        code: 'E2',
        ag: 'sub',
        ev: [
          [360, 520, 'rd', 'Read ×18'],
          [540, null, 'wait', 'waits · write'],
        ],
      },
      {
        name: 'qwen2.5',
        code: 'QW',
        ag: 'local',
        ev: [
          [100, 180, 'done', 'summarize'],
          [450, null, 'run', 'draft tests'],
        ],
      },
    ],
    forks: [
      { from: 0, to: 1, t: 126 },
      { from: 0, to: 2, t: 196 },
      { from: 0, to: 3, t: 356 },
    ],
    cps: [
      { t: 62, label: 'cp-3' },
      { t: 386, label: 'cp-4' },
    ],
  };
  const denseAgents = {
    n: 5,
    more: true,
    html: `${tele('612k', '28%', '11.4', 'qwen2.5-coder 14b', 'cloud <b>441k</b> · local <b>171k</b>')}
      <div class="col" style="gap: var(--sp-3); min-height: 0">
        ${card({ s: 'waiting', ag: 'sub', code: 'E2', n: 'Explore 2', label: '0:12', sel: true, now: 'wants to write <b>docs/notes.md</b>' })}
        ${card({ s: 'writing', ag: 'claude', code: 'CL', n: 'Claude', label: 'writing', now: 'Edit <b>src/services/queue.ts</b>' })}
        ${card({ s: 'reading', ag: 'sub', code: 'EX', n: 'Explore', label: 'reading', now: 'Read <b>src/api/routes.ts</b>' })}
        ${card({ s: 'running', ag: 'local', code: 'QW', where: 'local', n: 'qwen2.5-coder', label: 'running', now: 'Draft tests · 41 tok/s' })}
        ${card({ s: 'done', ag: 'sub', code: 'PL', n: 'Plan', label: 'done', now: '7 steps · 2:10' })}
      </div>`,
  };

  // ---------- error ----------
  const errMap = JSON.parse(JSON.stringify(normalMap));
  errMap.nodes = errMap.nodes.filter((n) => n.kind !== 'temp');
  errMap.nodes.push(N(416, 184, 314, '$ npm test -- schema', 'error', 'exit 1', 'temp'));
  errMap.chips = [
    {
      x: 560,
      y: 228,
      w: 170,
      ag: 'claude',
      code: 'CL',
      where: 'cloud',
      n: 'Claude',
      s: 'error',
      label: 'exited',
    },
  ];
  errMap.edges = [
    {
      cls: 'e-err',
      pts: [
        [645, 228],
        [645, 204],
      ],
    },
    {
      cls: 'e-err',
      pts: [
        [506, 184],
        [506, 60],
      ],
    },
  ];
  errMap.nodes.find((n) => n.n === 'index.ts').s = 'idle';
  errMap.nodes.find((n) => n.n === 'index.ts').meta = '';
  errMap.readout = [
    ['23', 'nodes'],
    ['7', 'touched'],
    ['1', 'agent'],
  ];
  const errTl = JSON.parse(JSON.stringify(normalTl));
  errTl.now = 140;
  errTl.nowLabel = '4:52';
  errTl.head =
    '<span>Timeline</span><span><b>Read ×4</b> · Grep ×2 · Edit ×2 · Bash ×2</span><span class="r">ended <b>4:52</b> · exit 1</span>';
  errTl.lanes = [
    {
      name: 'Claude',
      code: 'CL',
      ag: 'claude',
      rows: 2,
      ev: [
        [2, 9, 'rd', 'Read'],
        [10, 16, 'rd', 'Grep'],
        [18, 25, 'rd', 'Read'],
        [30, 44, 'ed', 'client.ts'],
        [46, 55, 'ed', 'types.ts'],
        [58, 92, 'err', '× schema.test.ts · 2 failing'],
        [94, 100, 'rd', 'Read'],
        Object.assign([94, 101, 'rd', 'Grep'], { row: 1 }),
        [104, 140, 'err', '× session exited · code 1'],
      ],
    },
  ];
  errTl.forks = [];

  // ---------- offline ----------
  const offMap = JSON.parse(JSON.stringify(normalMap));
  offMap.nodes = offMap.nodes
    .filter((n) => n.kind !== 'temp')
    .map((n) => (n.s === 'reading' || n.s === 'error' ? { ...n, s: 'idle', meta: '' } : n));
  offMap.nodes.push(
    N(416, 288, 314, 'qwen · explain schema.test.ts failure', 'running', '36 tok/s', 'temp'),
  );
  offMap.chips = [
    {
      x: 560,
      y: 326,
      w: 170,
      ag: 'local',
      code: 'QW',
      where: 'local',
      n: 'qwen2.5',
      s: 'running',
      label: 'running',
    },
  ];
  offMap.edges = [
    {
      cls: 'e-attach',
      pts: [
        [645, 326],
        [645, 308],
      ],
    },
    {
      cls: 'e-read',
      pts: [
        [416, 298],
        [400, 298],
        [400, 50],
        [416, 50],
      ],
      end: 'read',
    },
  ];
  offMap.readout = [
    ['23', 'nodes'],
    ['2', 'touched'],
    ['1', 'local agent'],
  ];
  const offTl = {
    t0: 0,
    t1: 140,
    now: 134,
    nowLabel: '1:02',
    head: '<span>Timeline</span><span>local only · Read ×1</span><span class="r">window <b>2:20</b></span>',
    lanes: [
      {
        name: 'qwen2.5',
        code: 'QW',
        ag: 'local',
        ev: [
          [70, 76, 'rd', 'Read'],
          [80, null, 'run', 'explain schema.test.ts failure'],
        ],
      },
    ],
    cps: [],
  };

  // ---------- empty / loading ----------
  const emptyMap = {
    w: 740,
    h: 360,
    ctr: [
      { x: 10, y: 16, w: 170, h: 40, label: 'src', count: '412 files', collapsed: true },
      { x: 196, y: 16, w: 170, h: 40, label: 'test', count: '96', collapsed: true },
      { x: 382, y: 16, w: 170, h: 40, label: 'scripts', count: '8', collapsed: true },
      { x: 568, y: 16, w: 160, h: 40, label: 'docs', count: '14', collapsed: true },
    ],
  };
  const loadMap = {
    w: 740,
    h: 360,
    ctr: [{ x: 10, y: 40, w: 360, h: 196, label: 'src/schema', count: '…' }],
    skel: [
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: 26, y: 64 + i * 28, w: 170 })),
      { x: 400, y: 40, w: 330, h: 140 },
      { x: 10, y: 260, w: 360, h: 84 },
    ],
  };
  const skelAgents = `<div class="tele"><i class="skel" style="height: calc(var(--sp-10) + var(--sp-5))"></i><i class="skel" style="height: calc(var(--sp-10) + var(--sp-5))"></i></div><i class="skel" style="height: calc(var(--sp-10) * 1.5)"></i>`;

  window.LIVE = {
    empty: {
      chrome: {
        title: { branch: 'main', docks: {} },
        act: { current: 'live' },
        status: { empty: true, vram: [0.4, 12], docker: '4 up' },
      },
      map: emptyMap,
      agents: {
        n: 0,
        html: '<div class="empty" style="padding: var(--sp-4)"><p>Agents appear here when a session starts: Claude, its subagents and local models.</p></div>',
      },
      dock: `${DOCK_HEAD()}<div class="chat"><div class="examples"><button>Explain how the schema client works<span>Reads files, changes nothing</span></button><button>Fix the flaky schema tests<span>Writes files, asks before running commands</span></button><button>Add tests for src/api/routes.ts<span>Creates a checkpoint before the first write</span></button></div></div>${COMPOSER('focus')}`,
    },
    loading: {
      chrome: { title: { branch: 'main' }, act: { current: 'live' }, status: { skeleton: true } },
      map: loadMap,
      agents: { n: '', html: skelAgents },
      dock: `${DOCK_HEAD()}<div class="chat"><div class="loading-note"><span class="prog run"></span>Reading the workspace…</div></div>${COMPOSER('focus')}`,
    },
    normal: {
      chrome: chromeNormal,
      map: normalMap,
      tl: normalTl,
      agents: normalAgents,
      dock: `${DOCK_HEAD('<span class="tag live">Live 2:14</span>')}<div class="chat fade">${USER_MSG}${CLAUDE_MSG()}</div>${PERM}${COMPOSER()}`,
    },
    dense: {
      chrome: {
        title: {
          session: 'Refactor the queue and fix the schema tests',
          sessTime: '9:50',
          docks: {},
        },
        act: { current: 'live', badges: { git: { n: 24 } } },
        status: {
          wait: { who: 'Explore 2', what: 'Write docs/notes.md', t: '0:12' },
          errors: 2,
          agents: ['claude', 'sub', 'sub', 'sub', 'local'],
          session: { t: '9:50', st: 'waiting' },
          tokens: '612k',
          local: '28%',
          changed: 24,
          vram: [11.4, 12],
          docker: '4 up',
        },
      },
      map: dense,
      tl: denseTl,
      agents: denseAgents,
      dock: `${DOCK_HEAD('<span class="tag live">Live 9:50</span>')}<div class="chat fade">${CLAUDE_MSG()}</div>
        <div class="perm"><div class="perm-h"><i data-g="s-waiting"></i><span class="t">Explore 2 wants to write a file</span><span class="r">Write · waiting 0:12</span></div>
        <dl><dt>File</dt><dd>docs/notes.md <span class="muted">(new)</span></dd><dt>Reason</dt><dd class="why">Save the call graph of the queue for the plan.</dd></dl>
        <div class="btns"><button class="btn lg pri wide">Approve <span class="kbd">Enter</span></button><button class="btn lg wide">Deny <span class="kbd">Esc</span></button></div>
        <div class="queue"><i data-g="s-waiting" class="g-s"></i><b>1 more</b> request queued · Claude</div></div>${COMPOSER()}`,
    },
    error: {
      chrome: {
        title: { session: 'Fix the flaky schema tests', sessTime: 'ended 4:52' },
        act: { current: 'live', badges: { git: { n: 2 } } },
        status: {
          errors: 1,
          agents: ['claude'],
          session: { t: '4:52', st: 'error' },
          tokens: '96k',
          changed: 2,
          vram: [0.4, 12],
          docker: '4 up',
        },
      },
      map: errMap,
      tl: errTl,
      agents: {
        n: 1,
        html: `${tele('96k', '0%', '0.4', 'no model loaded', 'cloud <b>96k</b> · local <b>0</b>')}${card({ s: 'error', ag: 'claude', code: 'CL', n: 'Claude', label: 'exited', sel: true, task: 'Fix the flaky schema tests', now: 'Bash <b>npm test -- schema</b> · exit 1', extra: '<div class="acts"><button class="btn">View log</button><button class="btn pri">Resume</button></div>' })}${chg(
          [
            ['src/schema/client.ts', 12, 3],
            ['src/schema/types.ts', 4, 1],
          ],
        )}`,
      },
      dock: `${DOCK_HEAD()}<div class="chat fade">${CLAUDE_MSG('<div class="banner s-error" style="border-radius: var(--r-3); border: var(--sz-hair) solid var(--st-error)"><i data-g="s-error"></i><span><b>Session ended.</b> claude exited with code 1. Your files and the checkpoint cp-3 are safe.</span></div><div class="row"><button class="btn">View log</button><button class="btn pri">Resume session</button></div>')}</div>${COMPOSER()}`,
    },
    offline: {
      chrome: {
        title: { session: 'Local: explain the failing test', sessTime: '1:02' },
        act: { current: 'live', badges: { git: { n: 2 } } },
        status: {
          offline: true,
          agents: ['local'],
          tokens: '9k',
          local: '100%',
          changed: 2,
          vram: [9.1, 12],
          docker: '4 up',
        },
      },
      map: offMap,
      tl: offTl,
      agents: {
        n: 1,
        html: `${tele('9k', '100%', '9.1', 'qwen2.5-coder 14b', 'cloud <b>0</b> · local <b>9k</b>')}${card({ s: 'running', ag: 'local', code: 'QW', where: 'local', n: 'qwen2.5-coder', label: 'running', sel: true, task: 'Explain why schema.test.ts fails', now: 'Generating · 36 tok/s' })}<div class="card s-idle ag-claude"><div class="h"><i data-sig="CL claude cloud"></i><span class="nm">Claude</span><span class="tag neutral">unavailable</span></div><div class="now">Needs a network connection</div></div>`,
      },
      dock: `${DOCK_HEAD('<span class="tag neutral"><i data-ic="offline" class="g"></i>offline</span>')}<div class="chat">${USER_MSG}<div class="msg muted">Claude stopped when the connection dropped at 14:12. The conversation resumes when you are back online.</div></div>${COMPOSER('off')}`,
    },
  };
})();
