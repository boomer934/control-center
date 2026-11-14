// Live replay (P1): a past session rebuilt from its JSONL, read-only, with a scrubber.
// Reuses the Live map and timeline; the mode bar says it is not live and what you can do.
(function () {
  'use strict';
  const L = window.LIVE;
  const past = (o = {}) => ({
    title: {
      session: 'Fix the flaky schema tests',
      sessTime: '12 Nov',
      mode: 'replay · read-only',
      docks: { bottom: false, session: false },
    },
    act: { current: 'live' },
    status: {
      agents: ['claude', 'sub', 'local'],
      session: { t: '6:41', st: 'done' },
      tokens: '204k',
      local: '38%',
      changed: 4,
      vram: [9.1, 12],
      docker: '4 up',
      ...o,
    },
  });
  const scrub = (pct, w = 6) =>
    `<span class="bar" style="width: calc(var(--sp-10) * ${w})"><i style="width: ${pct}%"></i></span>`;
  const mode = (when, ev, pct, extra = '') =>
    `<i data-ic="play" class="g"></i><b>Replay · read-only</b><span class="muted">Fix the flaky schema tests · 12 Nov 14:00 · 6:41</span>${scrub(pct)}<span class="mono">${when}</span><span class="muted">${ev}</span>${extra}<span class="push row"><button class="btn"><i data-ic="restore"></i>Restore files to this point…</button><button class="btn ghost"><i data-ic="plus"></i>New session from here</button></span>`;
  // Read-only: past permission requests show their outcome instead of live buttons.
  const ro = (A) => ({
    ...A,
    html: A.html.replace(
      /<div class="acts"><button class="btn pri">Approve[\s\S]*?<\/button><\/div>/g,
      '<div class="acts muted" style="font-size: var(--fs-xs)">Approved by you at 14:03</div>',
    ),
  });
  const centerMsg = (icon, h, p, btns, note = '') =>
    `<div class="tb"><span class="tool"><b>Replay</b></span></div><div class="body" style="align-items: center; justify-content: center"><div class="empty center-x">${icon}<h2>${h}</h2><p>${p}</p><div class="row">${btns}</div>${note}</div></div>`;

  window.PAGE = { id: 'replay', name: 'Replay', defaultState: 'normal' };
  window.LIVE = {
    empty: {
      ...L.empty,
      noDock: true,
      chrome: { ...L.empty.chrome, act: { current: 'live' } },
      center: centerMsg(
        '<i data-ic="play" class="g"></i>',
        'No past sessions in this workspace',
        'Every session is recorded locally as you work. When one ends, it shows up here and in the palette under #.',
        '<button class="btn pri">Start a task <span class="kbd">Ctrl+L</span></button>',
      ),
    },
    loading: {
      ...L.loading,
      base: 'loading',
      noDock: true,
      chrome: past({ session: undefined }),
      modebar:
        '<i data-ic="play" class="g"></i><b>Replay · read-only</b><span class="loading-note"><span class="prog run"></span>Rebuilding the state at 14:06 · 212 of 388 events</span>',
    },
    normal: {
      ...L.normal,
      base: 'normal',
      noDock: true,
      chrome: past(),
      agents: ro(L.normal.agents),
      tl: { ...L.normal.tl, nowLabel: '14:02' },
      modebar: mode('14:02', 'event 212 of 388', 55),
    },
    dense: {
      ...L.dense,
      base: 'dense',
      noDock: true,
      chrome: past({ session: { t: '3:12:40', st: 'done' }, tokens: '1.4M', changed: 37 }),
      agents: ro(L.dense.agents),
      tl: {
        ...L.dense.tl,
        nowLabel: '1:48',
        head: '<span>Timeline</span><span><b>Key events</b> · 3 errors · 6 permissions · 4 checkpoints</span><span class="r">zoom <b>10 min</b> of 3:12:40</span>',
      },
      modebar: mode(
        '1:48:20',
        'event 9,214 of 15,880',
        56,
        '<span class="row"><span class="tag filter" aria-pressed="true">errors</span><span class="tag filter" aria-pressed="true">permissions</span><span class="tag filter" aria-pressed="false">checkpoints</span></span>',
      ),
    },
    error: {
      ...L.error,
      noDock: true,
      chrome: {
        ...past({ errors: 1, agents: undefined, tokens: undefined, changed: undefined }),
        title: { mode: 'replay', docks: { bottom: false, session: false } },
      },
      center: centerMsg(
        '<i data-g="s-error" class="g st-c s-error"></i>',
        "Can't replay this session",
        'session-2026-10-02.jsonl was written with event schema v0, and this version reads v1. Nothing was changed: the file stays as it is.',
        '<button class="btn pri">Migrate a copy to v1</button><button class="btn"><i data-ic="code"></i>View raw</button>',
        '<span class="muted" style="font-size: var(--fs-xs)">Line 1,402 also failed validation: missing tool_input</span>',
      ),
    },
    offline: {
      ...L.normal,
      base: 'normal',
      noDock: true,
      chrome: past({ offline: true }),
      agents: ro(L.normal.agents),
      tl: { ...L.normal.tl, nowLabel: '14:02' },
      modebar: mode(
        '14:02',
        'event 212 of 388',
        55,
        '<span class="tag neutral"><i data-ic="offline" class="g"></i>works offline</span>',
      ),
    },
  };

  // The mode bar is page-specific: fill it after the shared renderer has run.
  window.addEventListener('load', () => {
    const el = document.getElementById('modebar');
    const D = window.LIVE[document.documentElement.dataset.state];
    if (!el) return;
    if (!D.modebar) return el.remove();
    el.innerHTML = D.modebar;
    window.CC.expand(el);
  });
})();
