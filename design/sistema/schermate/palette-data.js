// Command palette (Ctrl+K): recent suggestions, mixed results, each prefix, no results, destructive action with confirmation.
(function () {
  'use strict';
  const L = window.LIVE;
  const it = (icon, label, sub = '', kbd = '', cls = '') =>
    `<div class="it ${cls}">${icon.startsWith('<') ? icon : `<i data-ic="${icon}"></i>`}<span>${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}${kbd ? `<span class="kbd">${kbd}</span>` : ''}</div>`;
  const grp = (t) => `<div class="grp-h">${t}</div>`;
  const pal = (pre, q, body) =>
    `<div class="scrim"></div><div class="modal pal"><div class="q"><i data-ic="search"></i>${pre ? `<span class="pre">${pre}</span>` : ''}${q ? `<span>${q}</span><span class="caret"></span>` : '<span class="caret"></span><span class="ph">Type a command, a file, @agent, #session, ! for local, ? for help</span>'}</div><div class="res">${body}</div>
     <div class="ft"><span><span class="kbd">↑↓</span>move</span><span><span class="kbd">Enter</span>run</span><span><span class="kbd">Esc</span>close</span><span class="push">&gt; commands · / files · @ agents · # sessions · ! local · ? help</span></div></div>`;
  const sel = (s) => s.replace('class="it ', 'class="it sel ');

  window.PAGE = { id: 'palette', name: 'Command palette', defaultState: 'recent' };
  window.LIVE = {
    recent: {
      ...L.normal,
      overlay: pal(
        '',
        '',
        `${grp('Recent')}${sel(it('restore', 'Restore checkpoint…', 'Git', 'Enter'))}${it('play', 'Replay last session', '# 12 Nov 14:02')}${it('file', 'src/schema/client.ts', '/ file')}${grp('Suggested now')}${it(`<i data-g="s-waiting" class="g st-c s-waiting"></i>`, 'Go to the waiting request', 'Claude · Bash · 0:41', 'Ctrl+Shift+A')}${it('follow', 'Follow Claude on the map', '', 'F')}`,
      ),
    },
    mixed: {
      ...L.normal,
      overlay: pal(
        '',
        'schema',
        `${grp('Files')}${sel(it('file', '<mark>schema</mark>.test.ts', 'test/ · 2 failing', 'Enter'))}${it('file', 'src/<mark>schema</mark>/client.ts', 'written 1:02')}${grp('Commands')}${it('code', 'Run tests matching "<mark>schema</mark>"', '&gt; command')}${grp('Sessions')}${it('play', 'Fix the flaky <mark>schema</mark> tests', '# today 14:00')}${grp('Local agents')}${it('chip', 'Explain <mark>schema</mark>.test.ts failure', '! qwen2.5-coder')}`,
      ),
    },
    prefixes: {
      ...L.normal,
      overlay: pal(
        '@',
        '',
        `${grp('Agents · @')}${sel(it('<i data-sig="CL claude cloud"></i>', 'Claude', 'waiting 0:41 · Bash', 'Enter'))}${it('<i data-sig="EX sub cloud"></i>', 'Explore', 'reading src/schema/index.ts')}${it('<i data-sig="QW local local"></i>', 'qwen2.5-coder', 'running · 38 tok/s')}${grp('Other prefixes')}${it('code', '&gt; commands', '', '&gt;')}${it('file', '/ files', '', '/')}${it('play', '# past sessions', '', '#')}${it('chip', '! ask a local model', '', '!')}${it('info', '? help and shortcuts', '', '?')}`,
      ),
    },
    'no-results': {
      ...L.normal,
      overlay: pal(
        '/',
        'migrations/2024',
        `<div class="empty center-x" style="padding: var(--sp-6) 0"><h2>No files match "migrations/2024"</h2><p>Search covers the 1,204 files of acme-api. Try a shorter path, or <span class="kbd">&gt;</span> for commands.</p></div>`,
      ),
    },
    destructive: {
      ...L.normal,
      overlay: pal(
        '&gt;',
        'discard',
        `${grp('Commands')}${sel(it('trash', 'Discard all changes in the working tree…', 'Git · 4 files', 'Enter', 'danger'))}${it('trash', 'Discard changes to client.ts…', 'Git · 1 file', '', 'danger')}
        <div class="banner s-error" style="margin: var(--sp-3) var(--sp-2) 0; border-radius: var(--r-2); border: var(--sz-hair) solid var(--st-error)"><i data-g="s-error"></i><span><b>Discard 4 files?</b> A checkpoint is created first.</span><span class="acts"><button class="btn">Cancel</button><button class="btn danger pri">Discard 4 files</button></span></div>`,
      ),
    },
  };
})();
