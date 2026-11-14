// Destructive confirmations (F6): restore all, restore some files, discard, stop a container. Never Enter by default.
(function () {
  'use strict';
  const L = window.LIVE;
  const fileRow = (on, p, d) =>
    `<div class="lrow" style="padding: 0"><span class="check${on ? ' on' : ''}">${on ? '<i data-ic="check" class="g-s"></i>' : ''}</span><span class="p">${p}</span><span class="d">${d}</span></div>`;
  const modal = (icon, title, body, files, cta, hint = 'Enter does nothing here') =>
    `<div class="scrim"></div><div class="modal danger"><div class="mh"><i data-ic="${icon}" class="ic st-c s-error"></i><h2>${title}</h2></div><div class="mb">${body}${files ? `<div class="panel" style="padding: var(--sp-2) var(--sp-4)">${files}</div>` : ''}</div><div class="mf"><span class="hint">${hint}</span><button class="btn">Cancel <span class="kbd">Esc</span></button>${cta}</div></div>`;
  const files4 = [
    fileRow(
      true,
      'src/schema/client.ts',
      '<span class="add">+12</span> <span class="del">−3</span>',
    ),
    fileRow(true, 'src/schema/types.ts', '<span class="add">+4</span> <span class="del">−1</span>'),
    fileRow(true, 'src/schema/errors.ts', 'new · will be deleted'),
    fileRow(true, 'test/schema.test.ts', '<span class="add">+9</span> <span class="del">−2</span>'),
  ];
  const files2 = [
    files4[0],
    fileRow(false, 'src/schema/types.ts', 'kept'),
    fileRow(false, 'src/schema/errors.ts', 'kept'),
    files4[3],
  ];

  window.PAGE = { id: 'conferma', name: 'Destructive confirmation', defaultState: 'restore-all' };
  window.LIVE = {
    'restore-all': {
      ...L.normal,
      overlay: modal(
        'restore',
        'Restore checkpoint cp-3?',
        "<span><b>4 files</b> in the working tree go back to <b>14:06</b>, before Claude's first write. Your branch and commits are not touched. A checkpoint of the current state (cp-5) is created first, so you can undo.</span>",
        files4.join(''),
        '<button class="btn danger pri"><i data-ic="restore"></i>Restore 4 files</button>',
      ),
    },
    'restore-some': {
      ...L.normal,
      overlay: modal(
        'restore',
        'Restore 2 of 4 files from cp-3?',
        '<span>Only the selected files go back to 14:06. The others keep their current content.</span><div class="row"><span class="seg"><span aria-pressed="false">All files</span><span aria-pressed="true">Some files</span></span></div>',
        files2.join(''),
        '<button class="btn danger pri"><i data-ic="restore"></i>Restore 2 files</button>',
      ),
    },
    discard: {
      ...L.normal,
      overlay: modal(
        'trash',
        'Discard changes to client.ts?',
        '<span>The uncommitted change (<span class="add">+12</span> <span class="del">−3</span>) is removed from the working tree. A checkpoint is created first, so this can be undone from Git → Checkpoints.</span>',
        '',
        '<button class="btn danger pri"><i data-ic="trash"></i>Discard 1 file</button>',
      ),
    },
    'stop-container': {
      ...L.normal,
      overlay: modal(
        'stop',
        'Stop container postgres?',
        '<span><b>postgres</b> (postgres:17, port 5432) is used by <b>api</b>, which will lose its database connection. Data in the volume <span class="code-i">acme_pg</span> is kept.</span>',
        '',
        '<button class="btn danger pri"><i data-ic="stop"></i>Stop postgres</button>',
        'Docker keeps the volume',
      ),
    },
  };
})();
