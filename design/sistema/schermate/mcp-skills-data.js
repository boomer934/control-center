// MCP & Skills (P1): servers grouped by origin with a per-session toggle, skills with a preview.
// Toggles apply to the next session only: config files are read, never written from here.
(function () {
  'use strict';
  const L = window.LIVE;
  const tb = (extra = '') =>
    `<div class="tb"><span class="tool"><b>MCP &amp; Skills</b></span><span class="tool"><i data-ic="search"></i><span class="muted">Search servers, tools and skills</span><span class="kbd">/</span></span>${extra}<span class="r"><span class="tool"><i data-ic="refresh"></i>Reload configs</span></span></div>`;
  const layout = (left, right) =>
    `<div class="body" style="gap: var(--sp-4); padding: var(--sp-4)"><div class="col grow" style="min-height: 0">${left}</div><div class="col grow" style="min-height: 0">${right}</div></div>`;
  const panel = (h, sub, body, style = 'flex: 1; min-height: 0') =>
    `<div class="panel" style="${style}"><div class="ph">${h}<span class="muted">${sub}</span></div><div class="pb flush" style="padding: var(--sp-2)">${body}</div></div>`;
  const srv = (s, n, d, on = true, sel = false) =>
    `<div class="lrow${sel ? ' sel' : ''}"><i data-g="s-${s}" class="g st-c s-${s}"></i><span class="p">${n}</span><span class="d">${d}</span><span class="switch${on ? ' on' : ''}" title="Use in the next session"></span></div>`;
  const grp = (t) => `<div class="sect-h">${t}</div>`;
  const skill = (n, origin, d, sel = false) =>
    `<div class="lrow${sel ? ' sel' : ''}"><i data-ic="sparkle" class="g"></i><span class="p">${n}</span><span class="d">${origin} · ${d}</span></div>`;
  const preview = `<div class="panel" style="flex: none"><div class="ph"><span class="mono">.claude/skills/inizio-sessione/SKILL.md</span><span class="push row"><button class="btn ghost"><i data-ic="ext"></i>Open in editor</button></span></div><div class="pb"><div class="insp" style="flex: none"><div class="raw"><span class="k">name:</span> <span class="s">inizio-sessione</span>
<span class="k">description:</span> <span class="s">Starts a work session: reads the state and the next</span>
<span class="s">  steps, checks the repo and proposes the task.</span>
<span class="k">---</span>
<span class="s">1. Read docs/memoria/STATO.md and PROSSIMI_PASSI.md.</span>
<span class="s">2. git status --short, git log --oneline -10.</span></div></div></div></div>`;
  const note = `<div class="row muted" style="padding: var(--sp-2) var(--sp-4); font-size: var(--fs-xs)"><i data-ic="info" class="g"></i>Switches apply to the next session. Config files are not changed.</div>`;
  const servers = (sub, rows) => panel('MCP servers', sub, rows + note);
  const normalServers = servers(
    '6 servers · 4 on',
    `${grp('Project · .mcp.json')}${srv('running', 'postgres', 'stdio · 6 tools', true, true)}${srv('running', 'playwright', 'stdio · 21 tools')}${grp('User · ~/.claude.json')}${srv('running', 'github', 'stdio · 34 tools')}${srv('idle', 'figma', 'http · not used yet', false)}${srv('running', 'context7', 'http · 2 tools')}${srv('idle', 'linear', 'http · off', false)}`,
  );
  const skills = (sub, rows) => panel('Skills', sub, rows, 'flex: 1; min-height: 0');
  const normalSkills = skills(
    '5 skills',
    `${grp('Project · .claude/skills')}${skill('inizio-sessione', 'project', 'used 12×', true)}${skill('fine-sessione', 'project', 'used 9×')}${grp('User · ~/.claude/skills')}${skill('code-review', 'user', 'used 3×')}${skill('impeccable', 'user', 'used 2×')}${skill('dataviz', 'user', 'never used')}`,
  );
  const chrome = (base, o = {}) => ({
    ...base.chrome,
    act: { current: 'mcp' },
    status: { ...base.chrome.status, ...o },
  });

  window.PAGE = { id: 'mcp-skills', name: 'MCP & Skills', defaultState: 'normal' };
  window.LIVE = {
    empty: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: `${tb()}<div class="body" style="align-items: center; justify-content: center"><div class="empty center-x"><i data-ic="mcp" class="g"></i><h2>No MCP servers configured</h2><p>MCP servers give Claude extra tools: a database, a browser, your issue tracker. They are read from .mcp.json in the project and from ~/.claude.json. Skills are reusable instructions in .claude/skills.</p><div class="row"><button class="btn">What is MCP?</button><button class="btn ghost"><i data-ic="ext"></i>Open .mcp.json</button></div></div></div>`,
    },
    loading: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: `${tb()}${layout(
        `<div class="panel" style="flex: 1"><div class="ph">MCP servers</div><div class="pb col">${'<i class="skel cell"></i>'.repeat(5)}<span class="loading-note"><span class="prog run"></span>Reading .mcp.json and ~/.claude.json…</span></div></div>`,
        `<div class="panel" style="flex: 1"><div class="ph">Skills</div><div class="pb col">${'<i class="skel cell"></i>'.repeat(4)}</div></div>`,
      )}`,
    },
    normal: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal),
      center: `${tb()}${layout(normalServers, normalSkills + preview)}`,
    },
    dense: {
      ...L.dense,
      noDock: true,
      chrome: chrome(L.dense),
      center: `${tb('<span class="tool"><span class="tag filter" aria-pressed="true">all</span><span class="tag filter" aria-pressed="false">on</span><span class="tag filter" aria-pressed="false">failing</span></span>')}${layout(
        servers(
          '34 servers · 11 on · grouped by origin',
          `${grp('Project · .mcp.json · 8')}${srv('running', 'postgres', 'stdio · 6 tools', true, true)}${srv('running', 'playwright', 'stdio · 21 tools')}${srv('running', 'redis', 'stdio · 9 tools')}${srv('idle', 'sentry', 'http · off', false)}${srv('idle', 'docker', 'stdio · off', false)}<div class="lrow muted"><i data-ic="chev-r" class="g"></i>3 more</div>${grp('User · ~/.claude.json · 26')}${srv('running', 'github', 'stdio · 34 tools')}${srv('running', 'context7', 'http · 2 tools')}${srv('error', 'jira', 'http · 401 unauthorized')}<div class="lrow muted"><i data-ic="chev-r" class="g"></i>23 more</div>`,
        ),
        skills(
          '41 skills',
          `${grp('Project · 2')}${skill('inizio-sessione', 'project', 'used 12×', true)}${skill('fine-sessione', 'project', 'used 9×')}${grp('User · 39')}${skill('code-review', 'user', 'used 3×')}${skill('impeccable', 'user', 'used 2×')}<div class="lrow muted"><i data-ic="chev-r" class="g"></i>37 more · sorted by last use</div>`,
        ) + preview,
      )}`,
    },
    error: {
      ...L.normal,
      noDock: true,
      chrome: chrome(L.normal, { errors: 2 }),
      center: `${tb()}<div class="banner s-error"><i data-g="s-error"></i><span><b>.mcp.json is not valid:</b> line 14, <span class="code-i">servers.postgres.command</span> must be a string, got an array. The other servers still load.</span><span class="acts"><button class="btn"><i data-ic="ext"></i>Open at line 14</button></span></div>${layout(
        servers(
          '6 servers · 1 invalid · 1 failing',
          `${grp('Project · .mcp.json')}${srv('error', 'postgres', 'invalid config', false)}${srv('running', 'playwright', 'stdio · 21 tools')}${grp('User · ~/.claude.json')}${srv('error', 'github', 'exited with code 1', true, true)}${srv('running', 'context7', 'http · 2 tools')}`,
        ),
        `<div class="panel" style="flex: 1; min-height: 0"><div class="ph"><i data-g="s-error" class="g st-c s-error"></i>github did not start<span class="muted">npx @modelcontextprotocol/server-github</span></div><div class="pb col"><div class="insp" style="flex: none"><div class="raw">Error: GITHUB_PERSONAL_ACCESS_TOKEN is not set
    at main (index.js:22:11)
exit code 1 after 0.4 s</div></div><div class="row"><button class="btn"><i data-ic="refresh"></i>Retry</button><button class="btn ghost"><i data-ic="logs"></i>Full log</button><button class="btn ghost">Turn off for this session</button></div></div></div>`,
      )}`,
    },
    offline: {
      ...L.offline,
      noDock: true,
      chrome: chrome(L.offline),
      center: `${tb()}${layout(
        servers(
          '6 servers · 2 local on',
          `${grp('Project · .mcp.json')}${srv('running', 'postgres', 'stdio · 6 tools', true, true)}${srv('running', 'playwright', 'stdio · 21 tools')}${grp('User · ~/.claude.json')}${srv('running', 'github', 'stdio · needs network')}${srv('idle', 'figma', 'http · unavailable offline', false)}${srv('idle', 'context7', 'http · unavailable offline', false)}${srv('idle', 'linear', 'http · unavailable offline', false)}`,
        ),
        normalSkills + preview,
      )}`,
    },
  };
})();
