// Event inspector (Live → Inspector tab): human view, raw JSON, error event, Ollama event, nothing selected.
(function () {
  'use strict';
  const L = window.LIVE;
  const tabs = (raw) =>
    `<div class="row" style="padding: var(--sp-3) var(--sp-5) 0"><span class="seg"><span aria-pressed="${!raw}">Human</span><span aria-pressed="${raw}">Raw</span></span><span class="kbd push">R</span></div>`;
  const insp = (head, body, raw = false) => ({
    n: 3,
    html: `<div class="insp" style="margin: calc(var(--sp-4) * -1)">${tabs(raw)}<div class="ih">${head}</div><div class="ib">${body}</div></div>`,
  });
  const actions = (b) => `<div class="row" style="flex-wrap: wrap">${b}</div>`;

  const readHead =
    '<span class="t"><i data-g="s-reading" class="g st-c s-reading"></i>Read src/schema/index.ts</span><span class="sub">Explore (EX) · 2:01 · 14 ms · event 118</span>';
  const human = `<dl class="kv" style="grid-template-columns: auto 1fr"><dt>Tool</dt><dd>Read</dd><dt>File</dt><dd>src/schema/index.ts</dd><dt>Lines</dt><dd>1-212 of 212</dd><dt class="last">Agent</dt><dd class="last">Explore, child of Claude</dd></dl>
    <p class="muted" style="font-size: var(--fs-s)">Explore is mapping where the schema client is imported, for Claude's plan.</p>
    ${actions('<button class="btn"><i data-ic="eye"></i>Show on map</button><button class="btn"><i data-ic="ext"></i>Open in editor</button>')}`;
  const raw = `<div class="raw"><span class="k">{</span>
  <span class="k">"schemaVersion"</span>: <span class="n">1</span>,
  <span class="k">"type"</span>: <span class="s">"tool_use"</span>,
  <span class="k">"agent"</span>: { <span class="k">"id"</span>: <span class="s">"ex-1"</span>, <span class="k">"kind"</span>: <span class="s">"subagent"</span> },
  <span class="k">"tool"</span>: <span class="s">"Read"</span>,
  <span class="k">"input"</span>: { <span class="k">"file_path"</span>: <span class="s">"src/schema/index.ts"</span> },
  <span class="k">"ts"</span>: <span class="s">"2026-11-14T14:02:01.204Z"</span>,
  <span class="k">"durationMs"</span>: <span class="n">14</span>
<span class="k">}</span></div>${actions('<button class="btn"><i data-ic="copy"></i>Copy JSON</button>')}`;

  window.PAGE = { id: 'ispettore', name: 'Event inspector', defaultState: 'human' };
  window.LIVE = {
    human: { ...L.normal, inspector: true, agents: insp(readHead, human) },
    raw: { ...L.normal, inspector: true, agents: insp(readHead, raw, true) },
    error: {
      ...L.normal,
      inspector: true,
      agents: insp(
        '<span class="t"><i data-g="s-error" class="g st-c s-error"></i>schema.test.ts · 2 failing</span><span class="sub">Claude (CL) · Bash npm test -- schema · 1:12 · exit 1</span>',
        `<div class="stack" style="padding: 0"><div class="msgline">AssertionError: expected 'ok' to be 'error'</div><div class="fr own sel"><span class="loc">test/schema.test.ts:41</span><span>retries a failed fetch</span></div><div class="fr own"><span class="loc">test/schema.test.ts:58</span><span>rejects HTML</span></div><div class="fr"><span class="fold">9 frames in node_modules</span></div></div>
        ${actions('<button class="btn"><i data-ic="ext"></i>Open at line 41</button><button class="btn"><i data-ic="eye"></i>Show on map</button><button class="btn"><i data-ic="sparkle"></i>Explain locally</button>')}`,
      ),
    },
    ollama: {
      ...L.normal,
      inspector: true,
      agents: insp(
        '<span class="t"><i data-g="s-running" class="g st-c s-running"></i>Summarize vitest log</span><span class="sub">qwen2.5-coder 14b (QW) · local · 38 tok/s · started 1:22</span>',
        `<dl class="kv" style="grid-template-columns: auto 1fr"><dt>Source</dt><dd>delegate_to_local_agent (Claude)</dd><dt>Input</dt><dd>vitest-run-3.log · 1,840 lines</dd><dt>Tokens</dt><dd>4.1k in · 612 out</dd><dt class="last">VRAM</dt><dd class="last">9.1 GB · fits</dd></dl>
        <p class="muted" style="font-size: var(--fs-s)">Local agents never write files: changes come back as a diff proposal to approve.</p>
        ${actions('<button class="btn"><i data-ic="stop"></i>Stop</button>')}`,
      ),
    },
    none: {
      ...L.normal,
      inspector: true,
      agents: {
        n: 3,
        html: '<div class="empty" style="padding: var(--sp-5) var(--sp-2)"><i data-ic="info" class="g"></i><h2>Nothing selected</h2><p>Click an event in the timeline or a file on the map to see what happened, in human or raw view.</p></div>',
      },
    },
  };
})();
