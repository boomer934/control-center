// Workspace selector (P1), opened from the title bar: recents, search, a workspace that no
// longer exists, and the first launch with no workspace at all.
(function () {
  'use strict';
  const L = window.LIVE;
  const it = (badge, label, sub = '', right = '', cls = '') =>
    `<div class="it ${cls}"><span class="tag mono" style="height: var(--sz-icon)">${badge}</span><span>${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}${right}</div>`;
  const grp = (t) => `<div class="grp-h">${t}</div>`;
  const pick = (q, body, foot = '') =>
    `<div class="scrim" style="background: transparent"></div><div class="modal pal" style="left: calc(var(--act-w) + var(--sp-3)); transform: none; top: calc(var(--title-h) + var(--sp-2))"><div class="q"><i data-ic="search"></i>${q ? `<span>${q}</span><span class="caret"></span>` : '<span class="caret"></span><span class="ph">Find a workspace or type a path</span>'}</div><div class="res">${body}</div><div class="ft"><span><span class="kbd">↑↓</span>move</span><span><span class="kbd">Enter</span>open</span><span><span class="kbd">Ctrl+Enter</span>new window</span><span class="push"><span class="kbd">Ctrl+O</span>browse…</span></div>${foot}</div>`;
  const cur = '<span class="kbd">current</span>';
  const recents = `${grp('Recent')}${it('AC', 'acme-api', '~/code/acme-api · fix/schema-tests', cur, 'sel')}${it('BI', 'billing-svc', '~/code/billing-svc · main · 2 days ago')}${it('CC', 'control-center', '~/Desktop/control-center · feat/design-1c · 3 days ago')}${it('DO', 'dotfiles', '~/dotfiles · main · last week')}${grp('Actions')}<div class="it"><i data-ic="folder"></i><span>Open folder…</span><span class="kbd">Ctrl+O</span></div><div class="it"><i data-ic="plus"></i><span>Clone a repository…</span></div>`;

  window.PAGE = { id: 'workspace', name: 'Workspace selector', defaultState: 'recent' };
  window.LIVE = {
    recent: { ...L.normal, base: 'normal', overlay: pick('', recents) },
    search: {
      ...L.normal,
      base: 'normal',
      overlay: pick(
        'bil',
        `${grp('Recent · 2 of 23')}${it('BI', '<mark>bil</mark>ling-svc', '~/code/billing-svc · main · 2 days ago', '', 'sel')}${it('BI', '<mark>bil</mark>ling-svc-old', '~/archive/billing-svc-old · last month')}${grp('Path')}<div class="it"><i data-ic="folder"></i><span>Open C:\\code\\<mark>bil</mark>…</span><span class="sub">type a full path to open any folder</span></div>`,
      ),
    },
    missing: {
      ...L.normal,
      base: 'normal',
      overlay: pick(
        '',
        `${grp('Recent')}${it('AC', 'acme-api', '~/code/acme-api · fix/schema-tests', cur)}${it('LE', '<span class="row"><i data-g="s-error" class="g st-c s-error"></i>legacy-crm</span>', 'folder not found', '<span class="row" style="margin-left: auto"><button class="btn">Locate…</button><button class="btn ghost">Remove from recents</button></span>', 'sel')}${it('BI', 'billing-svc', '~/code/billing-svc · main · 2 days ago')}${grp('Actions')}<div class="it"><i data-ic="folder"></i><span>Open folder…</span><span class="kbd">Ctrl+O</span></div>`,
      ),
    },
    none: {
      ...L.empty,
      base: 'empty',
      noDock: true,
      chrome: {
        title: { none: true },
        act: { none: true },
        status: { empty: true, ws: '—', vram: [0.4, 12], docker: '4 up' },
      },
      center: `<div class="body" style="align-items: center; justify-content: center"><div class="empty center-x"><i data-ic="folder" class="g"></i><h2>Open a project to start</h2><p>Control Center watches one folder at a time: its files become the map, its git history the checkpoints.</p><div class="row"><button class="btn pri"><i data-ic="folder"></i>Open folder… <span class="kbd">Ctrl+O</span></button><button class="btn">Clone a repository…</button></div><div class="col" style="align-items: stretch; width: 100%; padding-top: var(--sp-4)"><div class="sect-h">Recent</div><div class="lrow"><span class="tag mono">AC</span><span class="p">acme-api</span><span class="d">~/code/acme-api</span></div><div class="lrow"><span class="tag mono">BI</span><span class="p">billing-svc</span><span class="d">~/code/billing-svc</span></div></div></div></div>`,
    },
  };
})();
