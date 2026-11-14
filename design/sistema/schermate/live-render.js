// Renders the Live view (map, timeline, agents column, session dock) from window.LIVE[state].
// Coordinates are data (what ELK would compute), not style: sizes and colors still come from tokens.
(function () {
  'use strict';
  const { g, esc, sig } = window.CC;
  const AGID = { claude: 'a-claude', sub: 'a-sub', local: 'a-local' };

  // orthogonal path with rounded fillets (radius 8) through the given points
  function rpath(pts, r = 8) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const a = Math.min(r, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
      const ux = Math.sign(x1 - x0),
        uy = Math.sign(y1 - y0),
        vx = Math.sign(x2 - x1),
        vy = Math.sign(y2 - y1);
      d += ` L${x1 - ux * a} ${y1 - uy * a} Q${x1} ${y1} ${x1 + vx * a} ${y1 + vy * a}`;
    }
    const last = pts[pts.length - 1];
    return `${d} L${last[0]} ${last[1]}`;
  }

  const px = (n) => `${n}px`;
  function nodeHTML(n) {
    const glyph =
      n.kind === 'folder'
        ? `<svg class="g"><use href="#i-folder"/></svg>`
        : g(`s-${n.s || 'idle'}`);
    const cls = ['node', `s-${n.s || 'idle'}`, n.kind || '', n.s === 'reading' ? 'pulse' : ''].join(
      ' ',
    );
    const meta = n.meta ? `<span class="meta">${n.meta}</span>` : '';
    const prog = n.s === 'running' ? '<span class="prog"></span>' : '';
    return `<div class="${cls}" style="left:${px(n.x)};top:${px(n.y)};width:${px(n.w)}" title="${esc(n.n)}"><span class="sign">${glyph}</span><span class="nm">${esc(n.n)}</span>${meta}${prog}</div>`;
  }
  function chipHTML(c) {
    return `<div class="achip ag-${c.ag} s-${c.s}" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)}">${sig(c.code, c.ag, c.where)}<span class="nmx ell">${esc(c.n)}</span><span class="st">${g(`s-${c.s}`)}${esc(c.label)}</span></div>`;
  }

  function map(M) {
    const stage = document.getElementById('stage');
    if (!M || !stage) return;
    let h = '';
    for (const c of M.ctr || [])
      h += `<div class="ctr${c.collapsed ? ' collapsed' : ''}" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)}"><span class="lg">${esc(c.label)} <i>· ${esc(c.count)}</i></span></div>`;
    for (const s of M.skel || [])
      h += `<i class="skel ${s.round ? 'round' : ''}" style="position:absolute;left:${px(s.x)};top:${px(s.y)};width:${px(s.w)};height:${px(s.h || 20)}"></i>`;
    const W = M.w || 760,
      H = M.h || 480;
    let e = '';
    for (const ed of M.edges || []) {
      e += `<path class="e ${ed.cls}" d="${rpath(ed.pts)}"/>`;
      if (ed.end) {
        const p = ed.pts[ed.pts.length - 1];
        e += `<circle class="e-end-${ed.end}" cx="${p[0]}" cy="${p[1]}" r="3"/>`;
      }
    }
    h += `<svg class="edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${e}</svg>`;
    for (const n of M.nodes || []) h += nodeHTML(n);
    for (const c of M.chips || []) h += chipHTML(c);
    stage.innerHTML = h;
    // Fit: if the graph does not fit, hide the legend first, then scale
    const box = document.getElementById('map').getBoundingClientRect();
    const legend = document.getElementById('legend');
    let avail = box.height - 16;
    if (legend && H > box.height - 72) {
      legend.remove();
    }
    const k = Math.min(1, (box.width - 16) / W, avail / H);
    const ty = Math.max(8, (box.height - H * k) / 2 - 24);
    stage.style.transform = `translate(8px, ${ty}px) scale(${k})`;
    stage.style.transformOrigin = '0 0';
    const z = document.getElementById('zoom');
    if (z) z.textContent = `${Math.round(k * 100)}%`;
    const ro = document.getElementById('readout');
    if (ro && M.readout)
      ro.innerHTML = M.readout.map(([v, l]) => `<span><b>${esc(v)}</b> ${esc(l)}</span>`).join('');
    const mini = document.getElementById('mini');
    if (mini) {
      const sx = 144 / W,
        sy = 96 / H;
      mini.innerHTML =
        (M.nodes || [])
          .map(
            (n) =>
              `<rect class="${n.s === 'writing' ? 'mm-w' : n.s === 'error' ? 'mm-e' : n.s === 'waiting' ? 'mm-q' : 'mm-n'}" x="${n.x * sx}" y="${n.y * sy}" width="${n.w * sx}" height="3" rx="1"/>`,
          )
          .join('') +
        `<rect class="mm-v" x="2" y="2" width="${(box.width / k) * sx - 4}" height="${(box.height / k) * sy - 4}" rx="3"/>`;
    }
  }

  function timeline(T) {
    const svg = document.getElementById('tlsvg');
    if (!T || !svg) return;
    const css = getComputedStyle(document.documentElement);
    const lane = parseFloat(css.getPropertyValue('--lane'));
    const W = document.getElementById('tl').getBoundingClientRect().width;
    const L = 120,
      R = W - 56;
    const x = (t) => L + ((t - T.t0) / (T.t1 - T.t0)) * (R - L);
    let y = 0,
      out = '';
    const laneY = [];
    T.lanes.forEach((ln) => {
      const rows = ln.rows || 1;
      const hgt = lane * (1 + (rows - 1) * 0.6);
      laneY.push(y);
      out += `<g style="color:var(--ag-${ln.ag})"><use href="#${AGID[ln.ag]}" x="10" y="${y + 8}" width="12" height="12"/><text class="ln-name" x="28" y="${y + 18}">${esc(ln.name)}</text><text class="ln-sig" x="28" y="${y + 30}">${esc(ln.code)}</text></g>`;
      for (const ev of ln.ev) {
        const ey = y + 7 + (ev.row || 0) * lane * 0.6;
        const x0 = x(ev[0]);
        const open = ev[1] == null;
        const x1 = open ? x(T.now) : Math.max(x(ev[1]), x0 + 14);
        const cls = {
          rd: 'ev-rd',
          ed: 'ev-ed',
          sh: 'ev-sh',
          err: 'ev-err',
          run: 'ev-run',
          wait: 'ev-wait',
          done: 'ev-done',
        }[ev[2]];
        const lb =
          { rd: 'lb-rd', ed: 'lb-ed', err: 'lb-err', run: 'lb-run', wait: 'lb-wait' }[ev[2]] || '';
        if (open)
          out += `<path class="ev ${cls}" d="M${x0 + 8} ${ey} H${x1} V${ey + 16} H${x0 + 8} Q${x0} ${ey + 16} ${x0} ${ey + 8} Q${x0} ${ey} ${x0 + 8} ${ey} Z"/>`;
        else
          out += `<rect class="ev ${cls}" x="${x0}" y="${ey}" width="${x1 - x0}" height="16" rx="8"/>`;
        if (ev[3] && x1 - x0 > 30) {
          const max = Math.floor((x1 - x0 - 14) / 7.4);
          const t = ev[3].length > max ? ev[3].slice(0, Math.max(1, max - 1)) + '…' : ev[3];
          out += `<text class="${lb}" x="${x0 + 7}" y="${ey + 12}">${esc(t)}</text>`;
        }
      }
      y += hgt;
      out += `<line class="sep" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
    });
    for (const f of T.forks || []) {
      const fx = x(f.t),
        fy = laneY[f.from] + 23,
        ty = laneY[f.to] + 15;
      out += `<path class="fork" d="M${fx} ${fy} V${ty - 8} Q${fx} ${ty} ${fx + 8} ${ty}"/><circle class="fork-dot" cx="${fx}" cy="${fy}" r="2.5"/>`;
    }
    const H = y + 22;
    for (const c of T.cps || []) {
      const cx = x(c.t);
      out += `<line class="cp-l" x1="${cx}" y1="0" x2="${cx}" y2="${y}"/><rect class="cp-f" x="${cx - 26}" y="${y + 3}" width="52" height="16" rx="8"/><text class="cp-t" x="${cx - 18}" y="${y + 15}">${esc(c.label)}</text>`;
    }
    const nx = x(T.now);
    out += `<line class="ax" x1="${L - 6}" y1="0" x2="${L - 6}" y2="${y}"/><line class="now-l" x1="${nx}" y1="0" x2="${nx}" y2="${y}"/><rect class="now-f" x="${nx - 46}" y="${y + 3}" width="44" height="16" rx="8"/><text class="now-t" x="${nx - 38}" y="${y + 15}">${esc(T.nowLabel || 'now')}</text>`;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    document.getElementById('tlh').innerHTML = T.head;
  }

  function agents(A) {
    const el = document.getElementById('agents');
    if (!A || !el) return;
    el.innerHTML = A.html;
    if (A.more) el.classList.add('more');
    document.getElementById('agn').textContent = A.n ?? '';
  }

  window.renderLive = function (cfg) {
    window.CC.page({
      id: (window.PAGE || cfg).id || 'live',
      name: (window.PAGE || cfg).name || 'Live',
      states: Object.keys(window.LIVE),
      defaultState: (window.PAGE || {}).defaultState || 'normal',
      chrome: (s) => window.LIVE[s].chrome,
      whenState: (s) => window.LIVE[s].base || s,
      after(s) {
        const D = window.LIVE[s];
        document.getElementById('dock').innerHTML = D.dock || '';
        if (D.noDock) document.querySelector('.win').classList.add('no-dock');
        if (D.center) document.querySelector('.center').innerHTML = D.center;
        if (D.bdock) document.querySelector('.btab').outerHTML = D.bdock;
        if (D.inspector)
          document
            .querySelectorAll('.side .tabs > span')
            .forEach((t, i) => t.setAttribute('aria-selected', String(i === 1)));
        if (D.overlay) document.querySelector('.win').insertAdjacentHTML('beforeend', D.overlay);
        agents(D.agents);
        window.CC.expand(document);
        timeline(D.tl);
        map(D.map);
        window.CC.expand(document);
      },
    });
  };
  if (!window.LIVE_MANUAL) window.addEventListener('DOMContentLoaded', () => window.renderLive({}));
})();
