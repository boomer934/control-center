// Shared shell for the phase 1c static mockups. No dependencies.
// - URL params: theme=dark|light, density=compact|comfortable, gray=1, state=<page state>, shot=1
// - Shorthands replaced at load: <i data-g="s-reading"> (12px glyph), <i data-ic="git"> (16px icon),
//   <i data-sig="CL claude cloud"> (channel sigil), [data-when="normal dense"] (shown only in those states).
// - [data-shell="title|act|status"] are filled from the page config passed to CC.page().
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const root = document.documentElement;
  const pick = (key, allowed, fallback) => {
    const v = params.get(key);
    return allowed.includes(v) ? v : fallback;
  };
  root.dataset.theme = pick('theme', ['dark', 'light'], root.dataset.theme || 'dark');
  root.dataset.density = pick('density', ['compact', 'comfortable'], 'compact');
  if (params.get('gray') === '1') root.dataset.gray = '1';
  if (params.get('shot') === '1') root.dataset.shot = '1';

  const PAGES = [
    ['componenti', '../componenti.html', 'Components'],
    ['live', 'live.html', '1 Live'],
    ['sessione', 'sessione.html', '2 Session'],
    ['permesso', 'permesso.html', '3 Permission'],
    ['ispettore', 'ispettore.html', '4 Inspector'],
    ['diff', 'diff.html', '5 Diff'],
    ['conferma', 'conferma.html', '6 Confirm'],
    ['git', 'git.html', '7 Git'],
    ['problems', 'problems.html', '8 Problems'],
    ['palette', 'palette.html', '9 Palette'],
    ['onboarding', 'onboarding.html', '10 Onboarding'],
    ['replay', 'replay.html', '11 Replay'],
    ['infra', 'infra.html', '12 Infra'],
    ['local-agents', 'local-agents.html', '13 Local agents'],
    ['mcp-skills', 'mcp-skills.html', '14 MCP & Skills'],
    ['settings', 'settings.html', '15 Settings'],
    ['terminal', 'terminal.html', '16 Terminal'],
    ['workspace', 'workspace.html', '17 Workspace'],
    ['notifiche', 'notifiche.html', '18 Notifications'],
  ];

  const SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="s-idle" viewBox="0 0 12 12"><circle cx="6" cy="6" r="2" fill="currentColor"/></symbol>
<symbol id="s-reading" viewBox="0 0 12 12"><path d="M3 2.2 7.2 6 3 9.8M6.5 2.2 10.7 6 6.5 9.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="s-writing" viewBox="0 0 12 12"><path d="M1.5 10.5 2.2 7.6 8.3 1.5 10.5 3.7 4.4 9.8Z" fill="currentColor" stroke="currentColor" stroke-width=".6" stroke-linejoin="round"/></symbol>
<symbol id="s-running" viewBox="0 0 12 12"><rect x="1" y="3.8" width="10" height="4.4" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="1" y="3.8" width="5.5" height="4.4" rx="2.2" fill="currentColor"/></symbol>
<symbol id="s-waiting" viewBox="0 0 12 12"><path d="M6 1.3 11.2 10.7H.8Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><rect x="5.3" y="4.5" width="1.4" height="3.1" rx=".5" fill="currentColor"/><rect x="5.3" y="8.3" width="1.4" height="1.3" rx=".5" fill="currentColor"/></symbol>
<symbol id="s-error" viewBox="0 0 12 12"><path d="M2.3 2.3 9.7 9.7M9.7 2.3 2.3 9.7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></symbol>
<symbol id="s-done" viewBox="0 0 12 12"><path d="M1.8 6.3 4.7 9.1 10.3 2.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="a-claude" viewBox="0 0 12 12"><path d="M6 1.2 10.8 6 6 10.8 1.2 6Z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="a-sub" viewBox="0 0 12 12"><path d="M6 1.3 10.7 6 6 10.7 1.3 6Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><rect x="4.9" y="4.9" width="2.2" height="2.2" rx=".4" fill="currentColor"/></symbol>
<symbol id="a-local" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1.6" fill="currentColor"/><path d="M4 .5V2.5M8 .5V2.5M4 9.5V11.5M8 9.5V11.5M.5 4H2.5M.5 8H2.5M9.5 4H11.5M9.5 8H11.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></symbol>
<symbol id="k-ground" viewBox="0 0 12 10"><path d="M6 0v4M1 4h10M3 6.5h6M4.8 9h2.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></symbol>
<symbol id="k-uplink" viewBox="0 0 12 10"><path d="M6 9.5V5.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="4.2" r="1.2" fill="currentColor"/><path d="M3.3 6.6a3.6 3.6 0 0 1 0-4.8M8.7 1.8a3.6 3.6 0 0 1 0 4.8M1.4 8.2a6.2 6.2 0 0 1 0-8M10.6.2a6.2 6.2 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></symbol>
<g id="icons" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
<symbol id="i-live" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><rect x="1.5" y="2" width="5" height="3.5" rx="1"/><rect x="9.5" y="2" width="5" height="3.5" rx="1"/><rect x="5.5" y="10.5" width="5" height="3.5" rx="1"/><path d="M4 5.5V8H12V5.5M8 8V10.5"/></g></symbol>
<symbol id="i-infra" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25"><rect x="2" y="2" width="12" height="5" rx="1.5"/><rect x="2" y="9" width="12" height="5" rx="1.5"/></g><rect x="4" y="4" width="2" height="1.2" rx=".4" fill="currentColor"/><rect x="4" y="11" width="2" height="1.2" rx=".4" fill="currentColor"/></symbol>
<symbol id="i-chip" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6 1.5V4M10 1.5V4M6 12V14.5M10 12V14.5M1.5 6H4M1.5 10H4M12 6H14.5M12 10H14.5"/></g></symbol>
<symbol id="i-mcp" viewBox="0 0 16 16"><path d="M5.5 1.5V5M10.5 1.5V5M3.5 5H12.5V8A4.5 4.5 0 0 1 3.5 8ZM8 12.5V15" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-git" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="4.5" cy="3.5" r="1.7"/><circle cx="4.5" cy="12.5" r="1.7"/><circle cx="11.5" cy="5.5" r="1.7"/><path d="M4.5 5.2V10.8M11.5 7.2C11.5 10 4.5 8.5 4.5 10.8"/></g></symbol>
<symbol id="i-tele" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M1.5 14.5H14.5"/><rect x="2.5" y="8" width="2.5" height="6.5" rx=".6"/><rect x="6.75" y="4" width="2.5" height="10.5" rx=".6"/><rect x="11" y="10" width="2.5" height="4.5" rx=".6"/></g></symbol>
<symbol id="i-gear" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="8" cy="8" r="2.3"/><path d="M8 1.5V4M8 12V14.5M1.5 8H4M12 8H14.5M3.4 3.4 5.2 5.2M10.8 10.8 12.6 12.6M3.4 12.6 5.2 10.8M10.8 5.2 12.6 3.4"/></g></symbol>
<symbol id="i-chev" viewBox="0 0 16 16"><path d="M4 6 8 10 12 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-chev-r" viewBox="0 0 16 16"><path d="M6 4 10 8 6 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-branch" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="4.5" cy="3.5" r="1.6"/><circle cx="4.5" cy="12.5" r="1.6"/><circle cx="11.5" cy="4.5" r="1.6"/><path d="M4.5 5.1V10.9M11.5 6.1C11.5 9 4.5 8 4.5 10.9"/></g></symbol>
<symbol id="i-follow" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="8" cy="8" r="4.5"/><path d="M8 1V4.5M8 11.5V15M1 8H4.5M11.5 8H15"/></g></symbol>
<symbol id="i-filter" viewBox="0 0 16 16"><path d="M2 3H14L9.5 8.5V13L6.5 14.5V8.5Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></symbol>
<symbol id="i-fit" viewBox="0 0 16 16"><path d="M2 6V2H6M10 2H14V6M14 10V14H10M6 14H2V10" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-play" viewBox="0 0 16 16"><path d="M4.5 3 12.5 8 4.5 13Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/></symbol>
<symbol id="i-stop" viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/></symbol>
<symbol id="i-min" viewBox="0 0 16 16"><path d="M3 8.5H13" stroke="currentColor"/></symbol>
<symbol id="i-max" viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="none" stroke="currentColor"/></symbol>
<symbol id="i-close" viewBox="0 0 16 16"><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" stroke="currentColor" stroke-linecap="round"/></symbol>
<symbol id="i-x" viewBox="0 0 16 16"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
<symbol id="i-dock-r" viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M10 2.5V13.5" stroke="currentColor" stroke-width="1.1"/></symbol>
<symbol id="i-dock-b" viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 9.5H14.5" stroke="currentColor" stroke-width="1.1"/></symbol>
<symbol id="i-search" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></g></symbol>
<symbol id="i-folder" viewBox="0 0 16 16"><path d="M1.5 4.5A1.5 1.5 0 0 1 3 3H6l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></symbol>
<symbol id="i-file" viewBox="0 0 16 16"><path d="M3.5 1.5H9.5L12.5 4.5V14.5H3.5ZM9.5 1.5V4.5H12.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></symbol>
<symbol id="i-term" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 6 7 8 4.5 10M8.5 10.5H11.5"/></g></symbol>
<symbol id="i-logs" viewBox="0 0 16 16"><path d="M3 4H13M3 8H13M3 12H9" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></symbol>
<symbol id="i-alert" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.8V8.6M8 11V11.2"/></g></symbol>
<symbol id="i-info" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2V11.2M8 4.8V5"/></g></symbol>
<symbol id="i-plus" viewBox="0 0 16 16"><path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
<symbol id="i-refresh" viewBox="0 0 16 16"><path d="M13 8A5 5 0 1 1 11.5 4.4M13 2.5V5.5H10" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-ext" viewBox="0 0 16 16"><path d="M9.5 2.5H13.5V6.5M13.5 2.5 7.5 8.5M12 9.5V13.5H2.5V4H6.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-copy" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5A1 1 0 0 0 9.5 2.5H3.5A1 1 0 0 0 2.5 3.5V9.5A1 1 0 0 0 3.5 10.5H5.5"/></g></symbol>
<symbol id="i-restore" viewBox="0 0 16 16"><path d="M3 8A5 5 0 1 0 4.5 4.4M3 2.5V5.5H6M8 5.5V8.5L10 10" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-trash" viewBox="0 0 16 16"><path d="M2.5 4.5H13.5M6 4.5V2.5H10V4.5M4 4.5 4.8 13.5H11.2L12 4.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-flag" viewBox="0 0 16 16"><path d="M3.5 14.5V2M3.5 2.5H12L10 5.5 12 8.5H3.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-box" viewBox="0 0 16 16"><path d="M8 1.8 14 5V11L8 14.2 2 11V5ZM2 5 8 8.2 14 5M8 8.2V14.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="i-plug" viewBox="0 0 16 16"><path d="M6 1.5V4.5M10 1.5V4.5M4 4.5H12V7.5A4 4 0 0 1 4 7.5ZM8 11.5V14.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-offline" viewBox="0 0 16 16"><path d="M1.5 6A9.5 9.5 0 0 1 9 3.6M14.5 6A9.5 9.5 0 0 0 12.6 4.6M4 8.6A6 6 0 0 1 8.5 7M6.5 11.2A2.5 2.5 0 0 1 9.5 11.2M2 2 14 14" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></symbol>
<symbol id="i-lock" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25"><rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5.5 7V5A2.5 2.5 0 0 1 10.5 5V7"/></g></symbol>
<symbol id="i-eye" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke-linejoin="round"/><circle cx="8" cy="8" r="2"/></g></symbol>
<symbol id="i-code" viewBox="0 0 16 16"><path d="M5.5 4 1.5 8 5.5 12M10.5 4 14.5 8 10.5 12" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-bell" viewBox="0 0 16 16"><path d="M4 11.5V7A4 4 0 0 1 12 7V11.5L13.5 12.5H2.5ZM6.5 14H9.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-check" viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-key" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="5" cy="8" r="3"/><path d="M8 8H14.5M12 8V10.5M14.5 8V10"/></g></symbol>
<symbol id="i-gpu" viewBox="0 0 16 16"><g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"><rect x="1.5" y="4" width="13" height="8" rx="1.5"/><circle cx="10.5" cy="8" r="2"/><path d="M4 12V14M7 12V14M4 6.5H6.5"/></g></symbol>
<symbol id="i-sparkle" viewBox="0 0 16 16"><path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="i-more" viewBox="0 0 16 16"><g fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></g></symbol>
</g>
<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" class="hatch-l"/></pattern>
</defs></svg>`;

  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  const svg = (id, cls) => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const g = (id, cls = 'g') => svg(id, cls);
  const ic = (id, cls = 'ic') => svg(`i-${id}`, cls);
  const AG = { claude: 'a-claude', sub: 'a-sub', local: 'a-local' };
  const sig = (code, ag, where) =>
    `<span class="sig ag-${ag}" title="${ag === 'local' ? 'local' : 'cloud'} agent">${g(AG[ag])}${esc(code)}${svg(where === 'local' ? 'k-ground' : 'k-uplink', 'k')}</span>`;

  function expand(scope) {
    scope.querySelectorAll('i[data-g]').forEach((el) => {
      el.outerHTML = g(el.dataset.g, el.className || 'g');
    });
    scope.querySelectorAll('i[data-ic]').forEach((el) => {
      el.outerHTML = ic(el.dataset.ic, el.className || 'ic');
    });
    scope.querySelectorAll('i[data-sig]').forEach((el) => {
      const [code, ag, where] = el.dataset.sig.split(' ');
      el.outerHTML = sig(code, ag, where);
    });
  }

  const SECTIONS = [
    ['live', 'live', 'Live', 'live.html'],
    ['infra', 'infra', 'Infra', 'infra.html'],
    ['local', 'chip', 'Local agents', 'local-agents.html'],
    ['mcp', 'mcp', 'MCP & Skills', 'mcp-skills.html'],
    ['git', 'git', 'Git', 'git.html'],
    ['tele', 'tele', 'Telemetry', '#'],
  ];

  function act(c) {
    const ws = c.none
      ? '<div class="ws none" title="No workspace"><span>+</span></div>'
      : `<div class="ws${c.invalid ? ' bad' : ''}" title="${esc(c.wsName || 'acme-api')}"><span>${esc(c.ws || 'AC')}</span></div>`;
    const items = SECTIONS.map(([id, icon, label, href]) => {
      const badge = c.badges && c.badges[id];
      const cur = c.current === id ? ' aria-current="page"' : '';
      const dis = c.none && id !== 'live' ? ' aria-disabled="true"' : '';
      const b = badge ? `<span class="badge${badge.err ? ' err' : ''}">${esc(badge.n)}</span>` : '';
      return `<a href="${href}" title="${label}"${cur}${dis}>${ic(icon)}${b}</a>`;
    }).join('');
    const set = `<a href="settings.html" title="Settings"${c.current === 'settings' ? ' aria-current="page"' : ''}>${ic('gear')}</a>`;
    return `${ws}<nav>${items}</nav><nav class="bottom">${set}</nav>`;
  }

  function title(c) {
    const crumbs = [];
    if (c.none) {
      crumbs.push('<span class="muted">No project open</span>');
      crumbs.push(
        `<span><button class="btn">${ic('folder')}Open project<span class="kbd">Ctrl+O</span></button></span>`,
      );
    } else {
      crumbs.push(
        `<span class="wsname">${c.invalid ? g('s-error', 'g st-c s-error') : ''}${esc(c.ws || 'acme-api')}${ic('chev', 'g')}</span>`,
      );
      if (c.branch !== false)
        crumbs.push(
          `<span class="branch">${ic('branch', 'g')}${esc(c.branch || 'fix/schema-tests')}</span>`,
        );
      if (c.session)
        crumbs.push(
          `<span class="sess ell">${esc(c.session)}${c.sessTime ? ` <small>${esc(c.sessTime)}</small>` : ''}</span>`,
        );
      if (c.mode) crumbs.push(`<span class="tag">${esc(c.mode)}</span>`);
    }
    const d = c.docks || {};
    const docks = `<span class="docks"><span class="icon-btn" aria-pressed="${d.bottom ? 'true' : 'false'}" title="Bottom dock">${ic('dock-b')}</span><span class="icon-btn" aria-pressed="${d.session === false ? 'false' : 'true'}" title="Session dock">${ic('dock-r')}</span></span>`;
    const wctl = `<span class="wctl"><span>${ic('min')}</span><span>${ic('max')}</span><span>${ic('close')}</span></span>`;
    return `<div class="crumbs">${crumbs.join('')}</div>${docks}${wctl}`;
  }

  function status(c) {
    const s = [];
    if (c.empty) {
      s.push(`<span>No session</span>`);
      s.push(`<span><b>${esc(c.ws || 'acme-api')}</b></span>`);
    }
    if (c.skeleton) {
      s.push('<span><i class="skel line round" style="width:var(--sp-10)"></i></span>');
      s.push('<span><i class="skel line round" style="width:calc(var(--sp-10) * 1.5)"></i></span>');
      s.push('<span><i class="skel line round" style="width:var(--sp-9)"></i></span>');
    }
    if (c.wait) {
      s.push(
        `<span class="wait">${g('s-waiting')}<b>${esc(c.wait.who || 'Claude')} waits</b>${esc(c.wait.what)} · ${esc(c.wait.t)}<i class="cur breathe"></i><span class="kbd">Ctrl+Shift+A</span></span>`,
      );
    }
    if (c.offline)
      s.push(`<span class="off">${ic('offline', 'g')}<b>Offline</b> · Claude unavailable</span>`);
    if (c.errors)
      s.push(
        `<span class="err">${g('s-error')}<b>${esc(c.errors)}</b> ${c.errors === 1 ? 'problem' : 'problems'}</span>`,
      );
    if (c.agents)
      s.push(
        `<span>${c.agents.map((a) => g(AG[a], `g ag-c ag-${a}`)).join('')}<b>${c.agents.length}</b> ${c.agents.length === 1 ? 'agent' : 'agents'}</span>`,
      );
    if (c.session)
      s.push(
        `<span>${g(`s-${c.session.st || 'running'}`, `g st-c s-${c.session.st || 'running'}`)}session <b>${esc(c.session.t)}</b></span>`,
      );
    if (c.tokens)
      s.push(
        `<span>tokens <b>${esc(c.tokens)}</b>${c.local ? ` · local <b>${esc(c.local)}</b>` : ''}</span>`,
      );
    if (c.changed) s.push(`<span><b>${esc(c.changed)}</b> changed</span>`);
    if (c.more) s.push(`<span class="more">${ic('more', 'g')}${esc(c.more)} more</span>`);
    const right = []; // [className, html]
    if (c.vram) {
      const [used, total] = c.vram;
      const full = Math.round((used / total) * 8);
      const cells = Array.from(
        { length: 8 },
        (_, i) => `<i${i < full ? ' class="f"' : ''}></i>`,
      ).join('');
      right.push(['', `VRAM <span class="vram">${cells}</span><b>${used}/${total} GB</b>`]);
    }
    if (c.docker)
      right.push([
        c.docker === 'off' ? 'neutral' : '',
        `${ic('box', 'g')}Docker <b>${esc(c.docker)}</b>`,
      ]);
    if (c.branch) right.push(['', `${ic('branch', 'g')}<b>${esc(c.branch)}</b>`]);
    const r = right.map(
      ([cls, html], i) => `<span class="${i === 0 ? 'r ' : ''}${cls}">${html}</span>`,
    );
    return s.join('') + r.join('');
  }

  function toggles(cfg) {
    const state = root.dataset.state;
    const link = (key, val) => {
      const p = new URLSearchParams(location.search);
      p.set(key, val);
      return `?${p.toString()}`;
    };
    const seg = (key, values, cur) =>
      `<span class="seg">${values.map((v) => `<a href="${link(key, v)}" aria-current="${v === cur ? 'true' : 'false'}">${esc(v)}</a>`).join('')}</span>`;
    const pages = PAGES.map(([id, href, label]) => {
      const h = cfg.root ? href.replace('../', '').replace(/^(?!componenti)/, 'schermate/') : href;
      return `<a href="${h}" aria-current="${id === cfg.id ? 'true' : 'false'}">${esc(label)}</a>`;
    });
    const states = cfg.states
      ? `<span class="grp">state ${seg('state', cfg.states, state)}</span>`
      : '';
    return `<span class="id">Control Center · ${esc(cfg.name)}</span>${states}
      <span class="grp">theme ${seg('theme', ['dark', 'light'], root.dataset.theme)}</span>
      <span class="grp">density ${seg('density', ['compact', 'comfortable'], root.dataset.density)}</span>
      <span class="grp">${seg('gray', ['0', '1'], root.dataset.gray === '1' ? '1' : '0')}</span>
      <span class="grp" style="width:100%">${pages.length ? `<span class="seg">${pages.join('')}</span>` : ''}</span>`;
  }

  function page(cfg) {
    const states = cfg.states || [];
    const st = params.get('state');
    root.dataset.state = states.includes(st) ? st : cfg.defaultState || states[0] || '';
    const state = root.dataset.state;
    document.body.insertAdjacentHTML('afterbegin', SPRITE);
    document.querySelectorAll('[data-when]').forEach((el) => {
      if (!el.dataset.when.split(' ').includes(state)) el.remove();
    });
    const chrome = cfg.chrome ? cfg.chrome(state) : {};
    document.querySelectorAll('[data-shell]').forEach((el) => {
      const kind = el.dataset.shell;
      if (kind === 'title') el.innerHTML = title(chrome.title || {});
      if (kind === 'act') el.innerHTML = act(chrome.act || {});
      if (kind === 'status') el.innerHTML = status(chrome.status || {});
    });
    const bar = document.querySelector('.toggles');
    if (bar && root.dataset.shot !== '1') bar.innerHTML = toggles(cfg);
    else if (bar) bar.remove();
    expand(document);
    if (cfg.after) cfg.after(state);
  }

  window.CC = { page, g, ic, sig, esc, expand, status, title, act };
})();
