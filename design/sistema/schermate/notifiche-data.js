// Notifications (P1): in-app toasts (info, done, error, grouped with a counter) and the
// Windows notifications shown when the app is in the background. A Windows notification never
// approves anything: it only brings you to the request, where the full context is visible.
(function () {
  'use strict';
  const L = window.LIVE;
  const toast = (cls, icon, b, s, extra = '') =>
    `<div class="toast ${cls}">${icon}<div class="tx"><b>${b}</b><span>${s}</span>${extra}</div></div>`;
  const toasts = `<div class="toasts">${toast('', '<i data-ic="info" class="g"></i>', 'Checkpoint cp-4 created', "Before Claude's first write")}${toast('s-done', '<i data-g="s-done"></i>', 'Explore finished', 'Read 14 files in src/schema · 0:48')}${toast('s-error', '<i data-g="s-error"></i>', 'vitest: 2 tests failed <span class="count">×3</span>', 'schema.test.ts · last at 14:08', '<div class="acts"><button class="btn">Open Problems</button><button class="btn ghost">Dismiss</button></div>')}</div>`;
  const os = (b, p, acts) =>
    `<div class="notif" style="position: absolute; z-index: 12; right: var(--sp-5); bottom: calc(var(--status-h) + var(--sp-5))"><div class="app"><i data-ic="live" class="g"></i>Control Center · acme-api<span style="margin-left: auto">now</span></div><b>${b}</b><p>${p}</p><div class="acts">${acts}</div></div>`;
  const tip =
    '<div class="tag" style="position: absolute; z-index: 12; right: var(--sp-5); bottom: calc(var(--status-h) + var(--sp-5) + var(--sp-10) * 3)">Windows notification · the app is in the background</div>';

  window.PAGE = { id: 'notifiche', name: 'Notifications', defaultState: 'toasts' };
  window.LIVE = {
    toasts: { ...L.normal, base: 'normal', noDock: true, overlay: toasts },
    'os-permission': {
      ...L.normal,
      base: 'normal',
      overlay:
        tip +
        os(
          'Claude is waiting for your permission',
          'Bash · rm -rf dist &amp;&amp; npm run build · waiting 0:41',
          '<button class="btn pri">Review request</button><button class="btn">Later</button>',
        ),
    },
    'os-stopped': {
      ...L.error,
      base: 'error',
      overlay:
        tip +
        os(
          'Claude stopped with an error',
          'npm test exited with code 1 after 4:52. Fix the flaky schema tests.',
          '<button class="btn pri">Open session</button><button class="btn">Dismiss</button>',
        ),
    },
    'os-done': {
      ...L.normal,
      base: 'normal',
      chrome: {
        ...L.normal.chrome,
        status: { ...L.normal.chrome.status, wait: undefined, session: { t: '6:41', st: 'done' } },
      },
      overlay:
        tip +
        os(
          'Task completed',
          'Fix the flaky schema tests · 6:41 · 4 files changed',
          '<button class="btn pri">Show diff</button><button class="btn">Dismiss</button>',
        ),
    },
  };
})();
