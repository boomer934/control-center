// Permission dialog variants (F4), docked in the Session panel over the Live normal state.
(function () {
  'use strict';
  const L = window.LIVE;
  const head =
    '<div class="dk-h"><b>Session</b><span class="mono">opus-5.5</span><span class="tag live">Live 2:14</span><span class="r"><span class="icon-btn"><i data-ic="more"></i></span></span></div>';
  const chat =
    '<div class="chat fade"><div class="msg"><div class="who"><i data-g="a-claude"></i>Claude · 2:02</div>The fetch never checks <code>res.ok</code>. I\'ll guard it, rebuild and rerun the tests.</div></div>';
  const composer =
    '<div class="composer"><div class="ctx"><span class="on"><b>opus-5.5</b></span><span>MCP <b>3</b></span><span>checkpoint <b>auto</b></span></div><div class="inp"><span>Reply or add context…</span><span class="kbd">Ctrl+L</span></div></div>';
  const btns = (always = true) =>
    `<div class="btns"><button class="btn lg pri wide">Approve <span class="kbd">Enter</span></button>${always ? '<button class="btn lg wide">Always this session <span class="kbd">Ctrl+Enter</span></button>' : ''}<button class="btn lg wide">Deny <span class="kbd">Esc</span></button></div>`;
  const perm = (t, r, body, opts = {}) =>
    `<div class="perm"><div class="perm-h"><i data-g="s-waiting"></i><span class="t">${t}</span><span class="r">${r}</span></div><dl>${body}</dl>${btns(opts.always !== false)}${opts.queue || ''}${opts.note ? `<div class="note">${opts.note}</div>` : ''}</div>`;
  const dock = (p) => `${head}${chat}${p}${composer}`;
  const diffLn = (a, b, s, t, k = '') =>
    `<div class="ln ${k}"><span>${a}</span><span>${b}</span><span class="sym">${s}</span><span>${t}</span></div>`;

  window.PAGE = { id: 'permesso', name: 'Permission dialog', defaultState: 'bash' };
  window.LIVE = {
    bash: {
      ...L.normal,
      dock: dock(
        perm(
          'Claude wants to run a command',
          'Bash · waiting 0:41',
          '<dt>Command</dt><dd class="cmd">rm -rf dist &amp;&amp; npm run build</dd><dt>Reason</dt><dd class="why">The tests import a stale build of the client from dist/.</dd><dt>Directory</dt><dd>~/code/acme-api</dd>',
          { note: 'Runs once in the workspace. Deny tells Claude why it was refused.' },
        ),
      ),
    },
    write: {
      ...L.normal,
      chrome: {
        ...L.normal.chrome,
        status: { ...L.normal.chrome.status, wait: { what: 'Edit client.ts', t: '0:08' } },
      },
      dock: dock(
        perm(
          'Claude wants to edit a file',
          'Edit · waiting 0:08',
          `<dt>File</dt><dd>src/schema/client.ts</dd><div class="snippet"><div class="diff">
        <div class="hunk">@@ -40,7 +40,10 @@ export async function load(url: string)</div>${diffLn(41, 41, ' ', '  const res = await fetch(url);')}${diffLn(42, '', '−', '  return res.json();', 'd')}${diffLn('', 42, '+', '  if (!res.ok) throw new SchemaError(res);', 'a')}${diffLn('', 43, '+', '  return parse(await res.json());', 'a')}${diffLn(43, 44, ' ', '}')}</div></div><dt>Reason</dt><dd class="why">Fail loudly instead of parsing an HTML error page.</dd>`,
          { note: 'A checkpoint (cp-3) exists from before the first write.' },
        ),
      ),
    },
    mcp: {
      ...L.normal,
      chrome: {
        ...L.normal.chrome,
        status: { ...L.normal.chrome.status, wait: { what: 'MCP github', t: '0:03' } },
      },
      dock: dock(
        perm(
          'Claude wants to use a tool',
          'MCP · github · waiting 0:03',
          '<dt>Server</dt><dd>github <span class="muted">· user config · npx @modelcontextprotocol/server-github</span></dd><dt>Tool</dt><dd>create_pull_request</dd><dt>Input</dt><dd>{ "title": "fix(schema): guard fetch", "base": "main", "draft": true }</dd>',
        ),
      ),
    },
    queue: {
      ...L.dense,
      dock: dock(
        perm(
          'Claude wants to run a command',
          'Bash · waiting 1:12',
          '<dt>Command</dt><dd class="cmd">npm test -- schema</dd><dt>Reason</dt><dd class="why">Verify the fix.</dd>',
          {
            queue:
              '<div class="queue"><i data-g="s-waiting" class="g-s"></i><b>2 more</b> requests queued · Explore 2 (Write), qwen2.5 (diff proposal)<span class="push kbd">Tab next</span></div>',
          },
        ),
      ),
    },
    long: {
      ...L.normal,
      dock: dock(
        perm(
          'Claude wants to run a command',
          'Bash · waiting 0:19',
          '<dt>Command</dt><dd class="cmd clamp">docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --service-ports --env-file .env.test api npm run test:integration -- --runInBand --reporters=default --coverage --coverageReporters=text-summary</dd><span class="expand">Show full command (214 characters)</span><dt>Reason</dt><dd class="why">Run the integration suite against the test database.</dd>',
        ),
      ),
    },
  };
})();
