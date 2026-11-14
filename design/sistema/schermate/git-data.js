// Git section (F6): branch, changed files, diff, commit, checkpoints. Replaces the center area.
(function () {
  'use strict';
  const L = window.LIVE;
  const tb = (extra = '') =>
    `<div class="tb"><span class="tool"><b>Git</b></span><span class="tool"><i data-ic="branch"></i><b class="mono">fix/schema-tests</b><span class="muted">↑2 ↓0 · origin</span></span>${extra}<span class="r"><span class="tool"><i data-ic="refresh"></i>Fetch</span><span class="tool">Pull</span><span class="tool">Push</span></span></div>`;
  const file = (k, p, d, sel) =>
    `<div class="lrow${sel ? ' sel' : ''}"><span class="tag mono" style="height: var(--sz-icon)">${k}</span><span class="p">${p}</span><span class="d">${d}</span></div>`;
  const cp = (id, t, what, files, cur) =>
    `<div class="lrow${cur ? ' sel' : ''}" style="height: calc(var(--row) + var(--sp-3))"><span class="tag cp"><i data-ic="flag" class="g"></i>${id}</span><span class="grow ell">${what}</span><span class="d">${t} · ${files}</span></div>`;
  const ln = (a, b, s, t, k = '') =>
    `<div class="ln ${k}"><span>${a}</span><span>${b}</span><span class="sym">${s}</span><span>${t}</span></div>`;
  const diff = `<div class="diff"><div class="hunk">@@ -40,7 +40,10 @@ export async function load(url: string)</div>${ln(41, 41, ' ', '  const res = await fetch(url);')}${ln(42, '', '−', '  return res.json();', 'd')}${ln('', 42, '+', '  if (!res.ok) throw new SchemaError(res);', 'a')}${ln('', 43, '+', '  return parse(await res.json());', 'a')}${ln(43, 44, ' ', '}')}</div>`;
  const commitBox = (disabledWhy) =>
    `<div class="panel" style="flex: none"><div class="ph">Commit<span class="muted">2 staged</span></div><div class="pb col"><div class="inp" style="min-height: calc(var(--sp-10) + var(--sp-2))"><span class="typed">fix(schema): guard fetch against non-JSON responses</span></div><div class="row"><button class="btn pri">Commit <span class="kbd">Ctrl+Enter</span></button><button class="btn"${disabledWhy ? ' disabled' : ''}>Commit &amp; push</button>${disabledWhy ? `<span class="muted" style="font-size: var(--fs-xs)">${disabledWhy}</span>` : ''}</div></div></div>`;
  const layout = (left, right) =>
    `<div class="body" style="gap: var(--sp-4); padding: var(--sp-4)"><div class="col" style="width: calc(var(--agents-w) * 1.25); flex: none; min-height: 0">${left}</div><div class="col grow" style="min-height: 0">${right}</div></div>`;
  const changes = (rows, extra = '') =>
    `<div class="panel" style="flex: 1; min-height: 0"><div class="ph">Changes<span class="muted">${extra}</span></div><div class="pb flush" style="padding: var(--sp-2)">${rows}</div></div>`;
  const checkpoints = `<div class="panel" style="flex: none"><div class="ph">Checkpoints<span class="muted">this session</span></div><div class="pb flush" style="padding: var(--sp-2)">${cp('cp-4', '14:08', 'before Bash npm test', '4 files', true)}${cp('cp-3', '14:06', "before Claude's first write", '2 files')}${cp('cp-2', '13:40', 'session start', '0 files')}<div class="row" style="padding: var(--sp-3) var(--sp-4) var(--sp-2)"><button class="btn"><i data-ic="restore"></i>Restore cp-4…</button><button class="btn ghost"><i data-ic="eye"></i>Show in timeline</button></div></div></div>`;
  const normalLeft =
    changes(
      `${file('M', 'src/schema/client.ts', '<span class="add">+12</span> <span class="del">−3</span>', true)}${file('M', 'src/schema/types.ts', '<span class="add">+4</span> <span class="del">−1</span>')}${file('A', 'src/schema/errors.ts', '<span class="add">+14</span>')}${file('M', 'test/schema.test.ts', '<span class="add">+9</span> <span class="del">−2</span>')}`,
      '4 files · 2 staged',
    ) + commitBox();
  const normalRight = `<div class="panel" style="flex: 1; min-height: 0"><div class="ph"><span class="mono">src/schema/client.ts</span><span class="muted">+12 −3</span><span class="push row"><button class="btn ghost">Stage</button><button class="btn ghost"><i data-ic="trash"></i>Discard…</button><button class="btn ghost"><i data-ic="ext"></i>Open in editor</button></span></div><div class="pb flush">${diff}</div></div>${checkpoints}`;
  const center = (body, extraTb = '', banner = '') => `${tb(extraTb)}${banner}${body}`;

  const denseRows = (() => {
    const dirs = [
      ['src/generated', 148],
      ['src/services', 22],
      ['test', 31],
      ['src/api', 9],
    ];
    return dirs
      .map(
        ([d, n], i) =>
          `<div class="lrow" style="font-weight: var(--fw-medium)"><i data-ic="${i === 0 ? 'chev-r' : 'chev'}" class="g"></i><i data-ic="folder" class="g"></i><span class="p" style="color: var(--fg-1)">${d}/</span><span class="d">${n} files</span></div>${i === 1 ? file('M', 'src/services/queue.ts', '<span class="add">+48</span> <span class="del">−21</span>', true) + file('M', 'src/services/jobs.ts', '<span class="add">+6</span> <span class="del">−6</span>') + file('A', 'src/services/backoff.ts', '<span class="add">+37</span>') : ''}`,
      )
      .join('');
  })();

  window.PAGE = { id: 'git', name: 'Git', defaultState: 'normal' };
  window.LIVE = {
    empty: {
      ...L.empty,
      noDock: true,
      chrome: { ...L.empty.chrome, act: { current: 'git' } },
      center: `${tb()
        .replace(/<span class="tool"><i data-ic="branch">.*?<\/span><\/span>/, '')
        .replace(
          /<span class="r">.*<\/span><\/div>$/,
          '</div>',
        )}<div class="body" style="align-items: center; justify-content: center"><div class="empty center-x"><i data-ic="git" class="g"></i><h2>Not a git repository</h2><p>acme-api has no .git folder. Initialize one to get diffs, commits and checkpoints you can restore.</p><button class="btn pri">Initialize repository…</button><span class="muted" style="font-size: var(--fs-xs)">Asks for confirmation · runs git init in ~/code/acme-api</span></div></div>`,
    },
    loading: {
      ...L.normal,
      noDock: true,
      chrome: { ...L.normal.chrome, act: { current: 'git' } },
      center: center(
        layout(
          `<div class="panel" style="flex: 1"><div class="ph">Changes</div><div class="pb col">${'<i class="skel cell"></i>'.repeat(5)}</div></div>`,
          `<div class="panel" style="flex: 1"><div class="ph"><i class="skel line" style="width: calc(var(--sp-10) * 3)"></i></div><div class="pb col">${'<i class="skel line"></i>'.repeat(8)}<span class="loading-note"><span class="prog run"></span>Reading repository status…</span></div></div>`,
        ),
      ),
    },
    normal: {
      ...L.normal,
      noDock: true,
      chrome: { ...L.normal.chrome, act: { current: 'git', badges: { git: { n: 4 } } } },
      center: center(layout(normalLeft, normalRight)),
    },
    dense: {
      ...L.dense,
      noDock: true,
      chrome: { ...L.dense.chrome, act: { current: 'git', badges: { git: { n: 210 } } } },
      center: center(
        layout(
          changes(denseRows, '210 files · grouped by folder') + commitBox(),
          `<div class="panel" style="flex: 1; min-height: 0"><div class="ph"><span class="mono">src/services/queue.ts</span><span class="muted">+48 −21</span></div><div class="pb flush">${diff}<div class="banner"><i data-ic="info" class="g"></i><span>Diffs load when you open a file. 148 generated files are collapsed.</span></div></div></div>${checkpoints}`,
        ),
        '<span class="tool"><i data-ic="filter"></i>Hide generated</span>',
      ),
    },
    error: {
      ...L.normal,
      noDock: true,
      chrome: {
        ...L.normal.chrome,
        status: { ...L.normal.chrome.status, errors: 1 },
        act: { current: 'git', badges: { git: { n: 3, err: true } } },
      },
      center: center(
        layout(
          changes(
            `<div class="sect-h">Conflicts · 2</div>${file('U', 'src/schema/client.ts', 'both modified', true)}${file('U', 'src/schema/types.ts', 'both modified')}<div class="sect-h">Merged · 1</div>${file('M', 'test/schema.test.ts', '<span class="add">+9</span> <span class="del">−2</span>')}`,
            'merge in progress',
          ),
          `<div class="panel" style="flex: 1; min-height: 0"><div class="ph"><span class="mono">src/schema/client.ts</span><span class="tag state s-error"><i data-g="s-error"></i>conflict</span></div><div class="pb flush"><div class="diff"><div class="hunk">&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD (fix/schema-tests)</div>${ln(42, '', ' ', '  if (!res.ok) throw new SchemaError(res);', 'a')}<div class="hunk">======= main</div>${ln(42, '', ' ', '  if (res.status >= 400) throw new HttpError(res);', 'd')}<div class="hunk">&gt;&gt;&gt;&gt;&gt;&gt;&gt;</div></div></div></div>`,
        ),
        '',
        '<div class="banner s-error"><i data-g="s-error"></i><span><b>Merge in progress: 2 conflicts.</b> Resolve them in the editor, then commit. Also: <span class="code-i">.git/index.lock</span> was left by a crashed git process.</span><span class="acts"><button class="btn"><i data-ic="ext"></i>Open in editor</button><button class="btn">Remove stale lock…</button><button class="btn danger">Abort merge…</button></span></div>',
      ),
    },
    offline: {
      ...L.offline,
      noDock: true,
      chrome: { ...L.offline.chrome, act: { current: 'git', badges: { git: { n: 4 } } } },
      center: center(
        layout(
          normalLeft.replace(commitBox(), commitBox('Push needs a network connection')),
          normalRight,
        ),
      )
        .replace(
          '<span class="tool">Pull</span><span class="tool">Push</span>',
          '<span class="tool muted" title="Offline">Pull · offline</span><span class="tool muted" title="Offline">Push · offline</span>',
        )
        .replace('<span class="tool"><i data-ic="refresh"></i>Fetch</span>', ''),
    },
  };
})();
