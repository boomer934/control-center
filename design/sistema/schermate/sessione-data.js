// Session dock states (F2), on top of the Live data. See schermate.md § Dock Session.
(function () {
  'use strict';
  const L = window.LIVE;
  const head = (extra = '') =>
    `<div class="dk-h"><b>Session</b><span class="mono">opus-5.5</span>${extra}<span class="r"><span class="icon-btn"><i data-ic="more"></i></span></span></div>`;
  const ctx =
    '<div class="ctx"><span class="on"><b>opus-5.5</b></span><span>MCP <b>3</b> · <u>manage</u></span><span>checkpoint <b>auto</b></span></div>';
  const composer = (inp) => `<div class="composer">${ctx}${inp}</div>`;
  const problem = (title, body, actions) => `
    <div class="chat"><div class="check-row s-error" style="align-items: flex-start"><i data-g="s-error" class="g st-c s-error"></i>
      <div class="tx"><b>${title}</b><span>${body}</span><div class="row" style="margin-top: var(--sp-4)">${actions}</div></div></div></div>`;
  const disabled = (why) => composer(`<div class="inp disabled"><span>${why}</span></div>`);
  const userMsg =
    '<div class="msg user">The schema tests are flaky, they fail about one run in three. Find out why and fix them.</div>';

  // a long conversation: virtualized, tools grouped
  const longChat = `
    <div class="chat fade">
      <div class="msg muted" style="font-size: var(--fs-xs)">42 earlier messages · <u>show</u></div>
      <div class="msg"><div class="who"><i data-g="a-claude"></i>Claude · 7:12</div>Queue retries now back off exponentially. Next I'll update the tests that relied on the fixed delay.
        <div class="trace"><div class="grp s-reading"><i data-g="s-reading" class="g k"></i>Read and Grep <b>18 files in src/services</b><span class="x">×24</span></div><div class="s-writing"><i data-g="s-writing" class="g k"></i>Edit <b>src/services/queue.ts</b><span class="x"><span class="add">+48</span> <span class="del">−21</span></span></div><div class="s-done"><i data-g="s-done" class="g k"></i>Bash <b>npm test -- queue</b><span class="x">41 passed</span></div></div></div>
      <div class="msg user">Keep the public API of the queue unchanged.</div>
      <div class="msg"><div class="who"><i data-g="a-claude"></i>Claude · 9:41</div>Understood: only internals change. Two subagents are mapping the callers.
        <div class="trace"><div class="s-running"><i data-g="s-running" class="g k"></i>Task <b>Explore: callers of enqueue()</b><span class="x">running</span></div><div class="s-waiting"><i data-g="s-waiting" class="g k"></i>Task <b>Explore 2: write docs/notes.md</b><span class="x">waiting</span></div></div></div>
    </div>`;

  const base = L.normal;
  window.PAGE = { id: 'sessione', name: 'Session dock', defaultState: 'normal' };
  window.LIVE = {
    empty: { ...L.empty },
    starting: {
      ...L.empty,
      chrome: {
        ...L.empty.chrome,
        title: { session: 'Fix the flaky schema tests', sessTime: 'starting' },
        status: { session: { t: '0:00', st: 'running' }, agents: ['claude'], docker: '4 up' },
      },
      dock: `${head('<span class="tag">Starting…</span>')}<div class="chat">${userMsg}<div class="loading-note"><span class="prog run"></span>Starting claude · resuming MCP servers (2 of 3)</div></div>${disabled('Wait for the session to start…')}`,
    },
    normal: { ...base },
    dense: {
      ...L.dense,
      dock: `${head('<span class="tag live">Live 9:50</span>')}${longChat}${composer('<div class="inp"><span>Reply or add context…</span><span class="kbd">Ctrl+L</span></div>')}`,
    },
    'cli-missing': {
      ...L.empty,
      chrome: { ...L.empty.chrome, status: { errors: 1, docker: '4 up' } },
      dock: `${head()}${problem('Claude Code is not installed', 'The app runs the official claude CLI. Install it, then retry: nothing else is needed.', '<button class="btn"><i data-ic="ext"></i>How to install</button><button class="btn pri"><i data-ic="refresh"></i>Retry</button>')}${disabled('Install Claude Code to start a session.')}`,
    },
    'not-logged-in': {
      ...L.empty,
      chrome: { ...L.empty.chrome, status: { errors: 1, docker: '4 up' } },
      dock: `${head()}${problem('Claude Code is not logged in', 'Run claude login once in the built-in terminal; the app never sees your credentials.', '<button class="btn"><i data-ic="term"></i>Run claude login</button><button class="btn pri"><i data-ic="refresh"></i>Retry</button>')}${disabled('Log in to start a session.')}`,
    },
    crashed: { ...L.error },
    offline: { ...L.offline },
  };
})();
