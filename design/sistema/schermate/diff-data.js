// Diff viewer (F5): over the center area. One file, several files, new/deleted/renamed, binary, huge diff.
(function () {
  'use strict';
  const L = window.LIVE;
  const ln = (a, b, s, t, k = '') =>
    `<div class="ln ${k}"><span>${a}</span><span>${b}</span><span class="sym">${s}</span><span>${t}</span></div>`;
  const files = (sel, extra = []) => {
    const rows = [
      ['src/schema/client.ts', '+12 −3', 'M'],
      ['src/schema/types.ts', '+4 −1', 'M'],
      ...extra,
    ];
    return `<div class="side" style="border-left: 0; border-right: var(--sz-hair) solid var(--line); width: calc(var(--agents-w) * 1.1)">
      <div class="tabs"><span aria-selected="true">Session files <span class="n">${rows.length}</span></span></div>
      <div class="col" style="padding: var(--sp-3); gap: var(--sp-1)">${rows
        .map(
          ([p, d, k], i) =>
            `<div class="lrow${i === sel ? ' sel' : ''}"><span class="tag mono" style="height: var(--sz-icon)">${k}</span><span class="p">${p}</span><span class="d">${d}</span></div>`,
        )
        .join('')}</div></div>`;
  };
  const head = (
    path,
    meta,
  ) => `<div class="tb"><span class="tool"><b class="mono">${path}</b></span><span class="tool">${meta}</span>
      <span class="r"><span class="tool"><span class="seg"><span aria-pressed="true">Last change</span><span aria-pressed="false">Since session start</span><span aria-pressed="false">vs HEAD</span></span></span><span class="tool"><i data-ic="eye"></i>Show on map</span><span class="tool"><i data-ic="ext"></i>Open in editor</span><span class="tool"><i data-ic="x"></i><span class="kbd">Esc</span></span></span></div>`;
  const clientDiff = `<div class="diff" style="flex: 1">
      <div class="hunk">@@ -1,6 +1,7 @@</div>${ln(1, 1, ' ', "import { parse } from './parse';")}${ln('', 2, '+', "import { SchemaError } from './errors';", 'a')}${ln(2, 3, ' ', '')}
      <div class="hunk">@@ -40,7 +41,16 @@ export async function load(url: string)</div>${ln(40, 41, ' ', 'export async function load(url: string) {')}${ln(41, 42, ' ', '  const res = await fetch(url);')}${ln(42, '', '−', '  return res.json();', 'd')}${ln('', 43, '+', '  if (!res.ok) {', 'a')}${ln('', 44, '+', '    throw new SchemaError(`fetch ${url}: ${res.status}`, res);', 'a')}${ln('', 45, '+', '  }', 'a')}${ln('', 46, '+', "  if (!res.headers.get('content-type')?.includes('json')) {", 'a')}${ln('', 47, '+', "    throw new SchemaError('expected JSON, got HTML', res);", 'a')}${ln('', 48, '+', '  }', 'a')}${ln('', 49, '+', '  return parse(await res.json());', 'a')}${ln(43, 50, ' ', '}')}</div>`;
  const view = (left, right) =>
    `<div class="sheet-over">${right[0]}<div style="display: flex; flex: 1; min-height: 0">${left}<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden">${right[1]}</div></div></div>`;
  const placeholder = (icon, title, text, btns = '') =>
    `<div class="empty center-x" style="margin-top: calc(var(--sp-10) * 2)"><i data-ic="${icon}" class="g"></i><h2>${title}</h2><p>${text}</p>${btns}</div>`;
  const base = { ...L.normal };

  window.PAGE = { id: 'diff', name: 'Diff viewer', defaultState: 'one-file' };
  window.LIVE = {
    'one-file': {
      ...base,
      overlay: view(files(0), [
        head(
          'src/schema/client.ts',
          '<span class="add">+12</span> <span class="del">−3</span> · Claude · 1:02',
        ),
        clientDiff,
      ]),
    },
    'many-files': {
      ...L.dense,
      overlay: view(
        files(0, [
          ['src/services/queue.ts', '+48 −21', 'M'],
          ['src/services/jobs.ts', '+6 −6', 'M'],
          ['test/queue.test.ts', '+31 −4', 'M'],
          ['src/api/routes.ts', '+2 −0', 'M'],
        ]),
        [
          head('src/schema/client.ts', '1 of 6 · <span class="kbd">Alt+↓</span> next file'),
          clientDiff,
        ],
      ),
    },
    'new-deleted-renamed': {
      ...base,
      overlay: view(
        files(2, [
          ['src/schema/errors.ts', '+14', 'A'],
          ['src/schema/legacy.ts', '−88', 'D'],
          ['src/util/retry.ts → src/schema/retry.ts', '+2 −2', 'R'],
        ]),
        [
          head('src/schema/errors.ts', 'new file · <span class="add">+14</span>'),
          `<div class="diff" style="flex: 1"><div class="hunk">@@ -0,0 +1,14 @@</div>${ln('', 1, '+', 'export class SchemaError extends Error {', 'a')}${ln('', 2, '+', '  constructor(message: string, readonly response?: Response) {', 'a')}${ln('', 3, '+', '    super(message);', 'a')}${ln('', 4, '+', "    this.name = 'SchemaError';", 'a')}${ln('', 5, '+', '  }', 'a')}${ln('', 6, '+', '}', 'a')}</div>`,
        ],
      ),
    },
    binary: {
      ...base,
      overlay: view(files(2, [['assets/schema-diagram.png', 'binary', 'M']]), [
        head('assets/schema-diagram.png', 'binary · 48 KB → 51 KB'),
        placeholder(
          'file',
          'Binary file changed',
          'No text diff for images and other binary files. Size went from 48 KB to 51 KB.',
          '<button class="btn"><i data-ic="ext"></i>Open both versions</button>',
        ),
      ]),
    },
    huge: {
      ...L.dense,
      overlay: view(files(0, [['src/generated/schema.gen.ts', '+4,812 −4,790', 'M']]), [
        head(
          'src/generated/schema.gen.ts',
          '<span class="add">+4,812</span> <span class="del">−4,790</span> · generated',
        ),
        `${clientDiff.replace('<div class="diff" style="flex: 1">', '<div class="diff">')}<div class="banner" style="border-top: var(--sz-hair) solid var(--line)"><span class="prog run" style="position: relative; left: auto; right: auto; bottom: auto; width: calc(var(--sp-10) * 2)"></span><span>Showing 1-400 of 9,602 changed lines · loading as you scroll</span><span class="acts"><button class="btn">Load all</button><button class="btn ghost">Collapse generated files</button></span></div>`,
      ]),
    },
  };
})();
