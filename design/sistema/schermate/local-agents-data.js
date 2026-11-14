// Local agents (P1): Ollama models, delegated tasks, quick commands, and the diff proposal.
// A local agent never writes files: changes arrive as a proposal that you approve or reject.
(function () {
  'use strict';
  const L = window.LIVE;
  const tb = (extra = '') =>
    `<div class="tb"><span class="tool"><b>Local agents</b></span><span class="tool"><i data-ic="chip"></i>Ollama <b class="mono">0.9.2</b><span class="muted">127.0.0.1:11434</span></span>${extra}<span class="r"><span class="tool"><i data-ic="plus"></i>Pull a model…</span><span class="tool"><i data-ic="refresh"></i>Refresh</span></span></div>`;
  const layout = (left, right) =>
    `<div class="body" style="gap: var(--sp-4); padding: var(--sp-4)"><div class="col" style="width: calc(var(--agents-w) * 1.3); flex: none; min-height: 0">${left}</div><div class="col grow" style="min-height: 0">${right}</div></div>`;
  const panel = (h, sub, body, style = 'flex: none', flush = true) =>
    `<div class="panel" style="${style}"><div class="ph">${h}<span class="muted">${sub}</span></div><div class="pb${flush ? ' flush' : ''}" style="${flush ? 'padding: var(--sp-2)' : ''}">${body}</div></div>`;
  const model = (n, size, fit, loaded, sel) =>
    `<div class="lrow${sel ? ' sel' : ''}"><i data-sig="QW local local"></i><span class="p">${n}</span>${loaded ? '<span class="tag state s-running"><i data-g="s-running"></i>loaded</span>' : ''}${fit === 'too big' ? '<span class="tag state s-waiting"><i data-g="s-waiting"></i>exceeds VRAM</span>' : ''}<span class="d">${size}${fit && fit !== 'too big' ? ` · ${fit}` : ''}</span></div>`;
  const models = (extra = '') =>
    panel(
      'Models',
      '4 installed · 9.1 / 12 GB VRAM',
      `${model('qwen2.5-coder:14b', '8.7 GB', '', true, true)}${model('llama3.2:3b', '2.0 GB', 'fits')}${model('nomic-embed-text', '0.3 GB', 'fits')}${model('deepseek-r1:32b', '19 GB', 'too big')}${extra}`,
    );
  const quick = panel(
    'Quick commands',
    '! in the palette',
    [
      'Explain the last error',
      'Summarize the test log',
      'Write a commit message',
      'Review the staged diff',
    ]
      .map(
        (t, i) =>
          `<div class="lrow"><i data-ic="${i === 3 ? 'eye' : 'sparkle'}" class="g"></i><span class="p" style="font-family: var(--font-sans)">${t}</span><span class="d">qwen2.5-coder</span></div>`,
      )
      .join(''),
    'flex: 1; min-height: 0',
  );
  const task = (s, label, t, model, meta, sel) =>
    `<div class="lrow${sel ? ' sel' : ''}" style="height: calc(var(--row) + var(--sp-3))"><span class="tag state s-${s}"><i data-g="s-${s}"></i>${label}</span><span class="grow ell">${t}</span><span class="d">${model} · ${meta}</span></div>`;
  const ln = (a, b, s, t, k = '') =>
    `<div class="ln ${k}"><span>${a}</span><span>${b}</span><span class="sym">${s}</span><span>${t}</span></div>`;
  const diff = `<div class="diff"><div class="hunk">@@ -40,7 +40,9 @@ export async function load(url: string)</div>${ln(41, 41, ' ', '  const res = await fetch(url);')}${ln(42, '', '−', '  return res.json();', 'd')}${ln('', 42, '+', '  const body = await res.text();', 'a')}${ln('', 43, '+', "  if (!body) throw new SchemaError('empty response');", 'a')}${ln('', 44, '+', '  return parse(JSON.parse(body));', 'a')}${ln(43, 45, ' ', '}')}</div>`;
  const proposalHead = (tag) =>
    `<div class="ph"><i data-sig="QW local local"></i>Proposal<span class="mono">src/schema/client.ts</span><span class="muted">+3 −1</span><span class="push">${tag}</span></div>`;
  const proposal = (tag, foot, banner = '') =>
    `<div class="panel" style="flex: 1; min-height: 0">${proposalHead(tag)}${banner}<div class="pb col" style="flex: none; gap: var(--sp-3)"><p style="font-size: var(--fs-s); color: var(--fg-2); line-height: var(--lh-prose)">The test fails because the mock server returns an empty body. Reading the text first gives a clear error instead of <span class="code-i">Unexpected end of JSON input</span>.</p></div><div class="pb flush">${diff}</div>${foot}</div>`;
  const foot = (html) =>
    `<div class="row" style="padding: var(--sp-4) var(--sp-5); border-top: var(--sz-hair) solid var(--line)">${html}</div>`;
  const tasks = (rows, sub = '3 today') => panel('Delegated tasks', sub, rows);
  const normalTasks = tasks(
    `${task('waiting', 'proposal', 'Fix the empty-body case in load()', 'qwen2.5-coder', '1:12', true)}${task('running', 'running', 'Summarize vitest log', 'qwen2.5-coder', '38 tok/s')}${task('done', 'done', 'Explain schema.test.ts failure', 'llama3.2', '0:21')}`,
  );
  const chrome = (base, o = {}) => ({
    ...base.chrome,
    act: { current: 'local', badges: { local: { n: 1 } } },
    status: { ...base.chrome.status, ...o },
  });
  const center = (left, right, extraTb) => `${tb(extraTb)}${layout(left, right)}`;
  const approveFoot = foot(
    '<button class="btn pri">Apply to working tree <span class="kbd">Enter</span></button><button class="btn">Reject <span class="kbd">Esc</span></button><button class="btn ghost"><i data-ic="sparkle"></i>Send to Claude</button><span class="push muted" style="font-size: var(--fs-xs)">A checkpoint is created before applying</span>',
  );

  window.PAGE = { id: 'local-agents', name: 'Local agents', defaultState: 'proposal' };
  window.LIVE = {
    empty: {
      ...L.normal,
      noDock: true,
      chrome: {
        ...chrome(L.normal, { vram: [0.4, 12], local: undefined }),
        act: { current: 'local' },
      },
      center: `<div class="tb"><span class="tool"><b>Local agents</b></span></div><div class="body" style="align-items: center; justify-content: center"><div class="empty center-x"><i data-ic="chip" class="g"></i><h2>No local models</h2><p>Local agents run on Ollama, on this machine. They explain, summarize and propose changes; they never write files on their own, and nothing leaves your PC.</p><div class="row"><button class="btn pri">How to install Ollama</button><button class="btn"><i data-ic="refresh"></i>Retry</button></div></div></div>`,
    },
    loading: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: center(
        panel(
          'Models',
          '',
          `<div class="col">${'<i class="skel cell"></i>'.repeat(4)}</div>`,
          'flex: none',
          false,
        ),
        panel(
          'Delegated tasks',
          '',
          `<div class="col">${'<i class="skel cell"></i>'.repeat(3)}<span class="loading-note"><span class="prog run"></span>Listing models from Ollama…</span></div>`,
          'flex: none',
          false,
        ),
      ),
    },
    normal: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: center(
        models() + quick,
        `${tasks(
          `${task('running', 'running', 'Summarize vitest log', 'qwen2.5-coder', '38 tok/s', true)}${task('done', 'done', 'Explain schema.test.ts failure', 'llama3.2', '0:21')}`,
          '2 today',
        )}<div class="panel" style="flex: 1; min-height: 0"><div class="ph"><i data-sig="QW local local"></i>Summarize vitest log<span class="muted">qwen2.5-coder · 38 tok/s</span><span class="push"><button class="btn ghost"><i data-ic="stop"></i>Stop</button></span></div><div class="pb col" style="font-size: var(--fs-m); line-height: var(--lh-prose); color: var(--fg-1)"><p>2 of 41 tests fail, both in <span class="code-i">test/schema.test.ts</span>:</p><p>• <b>parses nested refs</b> expects a 200, the mock returns an empty body.</p><p>• <b>retries on 503</b> times out after 5 s: the retry waits 8 s.</p></div></div>`,
      ),
    },
    dense: {
      ...L.dense,
      noDock: true,
      chrome: chrome(L.dense),
      center: center(
        models() + quick,
        `${tasks(
          [
            task('running', 'running', 'Summarize vitest log', 'qwen2.5-coder', '38 tok/s', true),
            task(
              'idle',
              'queued 1',
              'Explain ECONNREFUSED in api logs',
              'qwen2.5-coder',
              'waits for VRAM',
            ),
            task('idle', 'queued 2', 'Write a commit message', 'qwen2.5-coder', '—'),
            task('idle', 'queued 3', 'Review src/services/queue.ts', 'qwen2.5-coder', '—'),
            task('idle', 'queued 4', 'Summarize docker logs worker', 'llama3.2', '—'),
            task(
              'waiting',
              'proposal',
              'Fix the empty-body case in load()',
              'qwen2.5-coder',
              '1:12',
            ),
            task('done', 'done', 'Explain schema.test.ts failure', 'llama3.2', '0:21'),
            task('error', 'failed', 'Embed docs/ for search', 'nomic-embed-text', 'aborted'),
            task('done', 'done', 'Summarize PR #12 discussion', 'llama3.2', '0:48'),
          ].join(''),
          '9 today · 4 queued · one model at a time',
        )}`,
        '<span class="tool"><span class="tag filter" aria-pressed="true">all</span><span class="tag filter" aria-pressed="false">queued</span><span class="tag filter" aria-pressed="false">proposals</span></span>',
      ),
    },
    error: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal, { errors: 1, vram: [0.4, 12], local: undefined }),
      center: `${tb()}<div class="banner s-error"><i data-g="s-error"></i><span><b>Ollama stopped answering.</b> The request for "Summarize vitest log" was aborted after 12 s. Claude and the rest of the app keep working.</span><span class="acts"><button class="btn"><i data-ic="refresh"></i>Retry</button><button class="btn ghost">How to restart Ollama</button></span></div>${layout(
        models(),
        `${tasks(`${task('error', 'failed', 'Summarize vitest log', 'qwen2.5-coder', 'aborted', true)}${task('done', 'done', 'Explain schema.test.ts failure', 'llama3.2', '0:21')}`, '2 today')}<div class="panel" style="flex: none"><div class="ph"><i data-g="s-waiting" class="g st-c s-waiting"></i>deepseek-r1:32b does not fit in VRAM</div><div class="pb col"><p style="font-size: var(--fs-s); color: var(--fg-2); line-height: var(--lh-prose)">It needs 19 GB and the GPU has 12 GB. It would run mostly on the CPU, about ten times slower.</p><div class="row"><button class="btn pri">Choose a smaller model</button><button class="btn">Use anyway</button></div></div></div>`,
      )}`,
    },
    proposal: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: center(
        models() + quick,
        normalTasks +
          proposal(
            '<span class="tag state s-waiting"><i data-g="s-waiting"></i>needs your review</span>',
            approveFoot,
          ),
      ),
    },
    approved: {
      ...L.normal,
      noDock: true,
      chrome: { ...chrome(L.normal, { changed: 3 }), act: { current: 'local' } },
      center: center(
        models() + quick,
        normalTasks.replace(
          's-waiting"><i data-g="s-waiting"></i>proposal',
          's-done"><i data-g="s-done"></i>applied',
        ) +
          proposal(
            '<span class="tag state s-done"><i data-g="s-done"></i>applied</span>',
            foot(
              '<button class="btn"><i data-ic="restore"></i>Undo · restore cp-5…</button><button class="btn ghost"><i data-ic="eye"></i>Show in Git</button>',
            ),
            '<div class="banner"><i data-g="s-done" class="g st-c s-done"></i><span><b>Applied to src/schema/client.ts.</b> Checkpoint cp-5 was created first.</span></div>',
          ),
      ),
    },
    rejected: {
      ...L.normal,
      noDock: true,
      chrome: { ...chrome(L.normal), act: { current: 'local' } },
      center: center(
        models() + quick,
        normalTasks.replace(
          's-waiting"><i data-g="s-waiting"></i>proposal',
          's-idle"><i data-g="s-idle"></i>rejected',
        ) +
          proposal(
            '<span class="tag state s-idle"><i data-g="s-idle"></i>rejected</span>',
            foot(
              '<button class="btn"><i data-ic="refresh"></i>Ask again with a note…</button><button class="btn ghost"><i data-ic="sparkle"></i>Send to Claude</button>',
            ),
            '<div class="banner"><i data-ic="info" class="g"></i><span><b>Rejected.</b> Nothing was written; the proposal stays here for this session.</span></div>',
          ),
      ),
    },
  };
})();
