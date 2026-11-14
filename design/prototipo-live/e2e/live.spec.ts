import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Replay, ReplayOp } from '../src/replay/types';
import { HOLD_MS } from '../src/replay/state';

const RAW = resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/fixtures/raw');
const recorded = (id: string) => existsSync(join(RAW, `sessione-${id}.jsonl`));

test.skip(
  !['01', '02', '03', '04', '05'].every(recorded),
  'raw fixtures sessione-01..05 are not recorded on this machine (see scripts/fixtures/README.md)',
);

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => {
  expect(errors, 'console must stay clean').toEqual([]);
});

async function replayOf(request: APIRequestContext, id: string): Promise<Replay> {
  const res = await request.get(`/fixtures/${id}.json`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as Replay;
}
function find(r: Replay, pred: (o: ReplayOp) => boolean): ReplayOp {
  const op = r.ops.find(pred);
  if (!op) throw new Error(`no matching op in ${r.name}`);
  return op;
}
async function open(page: Page, id: string, t: number | 'end', theme = 'dark') {
  await page.goto(`/?fixture=${id}&t=${typeof t === 'number' ? Math.round(t) : t}&theme=${theme}`);
  await expect(page.locator('.proto[data-ready="true"] .map[data-fitted="true"]')).toBeVisible();
}
const node = (page: Page, name: string) => page.locator(`.node[data-node="${name}"]`);

test.describe('states', () => {
  test('reading: a subagent reads, forked from the main lane', async ({ page, request }) => {
    const r = await replayOf(request, '03');
    const read = find(r, (o) => o.kind === 'read' && o.agent !== 'main');
    await open(page, '03', read.start + 40);
    await expect(node(page, read.target ?? '')).toHaveAttribute('data-state', 'reading');
    await expect(page.locator('.achip.s-reading')).toBeVisible();
    await expect(page.locator('.card[data-agent="CL"] .tag')).toHaveText('delegating');
    await expect(page.locator('.tl .fork')).toHaveCount(1);
    await expect(page).toHaveScreenshot('reading-dark.png');
  });

  test('writing: an edit in progress', async ({ page, request }) => {
    const r = await replayOf(request, '01');
    const edit = find(r, (o) => o.kind === 'write');
    await open(page, '01', edit.start + 40);
    await expect(node(page, edit.target ?? '')).toHaveAttribute('data-state', 'writing');
    await expect(page.locator('.achip.s-writing')).toBeVisible();
    await expect(page).toHaveScreenshot('writing-dark.png');
  });

  test('running: a shell command in progress', async ({ page, request }) => {
    const r = await replayOf(request, '02');
    const sh = find(r, (o) => o.kind === 'shell');
    await open(page, '02', sh.start + 300);
    await expect(page.locator('.node.temp.s-running')).toHaveCount(1);
    await expect(page.locator('.node.temp.s-running .prog')).toBeVisible();
    await expect(page).toHaveScreenshot('running-dark.png');
  });

  test('error: failing tests are labelled with the target', async ({ page, request }) => {
    const r = await replayOf(request, '02');
    const sh = find(r, (o) => o.kind === 'shell' && o.outcome === 'error');
    await open(page, '02', Math.max(sh.end, sh.start + HOLD_MS) + 60);
    await expect(page.locator('.node.temp.s-error .meta')).toContainText('1 failing');
    await expect(page.locator('.tl .lb-err')).toContainText('1 failing');
    await expect(page).toHaveScreenshot('error-dark.png');
  });

  test('error: a missing file', async ({ page, request }) => {
    const r = await replayOf(request, '05');
    const rd = find(r, (o) => o.outcome === 'error');
    await open(page, '05', Math.max(rd.end, rd.start + HOLD_MS) + 60);
    await expect(node(page, rd.target ?? '')).toHaveAttribute('data-state', 'error');
    await expect(node(page, rd.target ?? '')).toContainText('not found');
    await expect(page).toHaveScreenshot('error-missing-dark.png');
  });

  test('waiting: a permission request (simulated wait)', async ({ page, request }) => {
    const r = await replayOf(request, '04');
    const ps = find(r, (o) => o.outcome === 'denied');
    await open(page, '04', ps.start + 2500);
    await expect(page.locator('.node.temp.s-waiting')).toHaveCount(1);
    await expect(page.locator('.card[data-agent="CL"] .tag')).toHaveText('waits');
    await expect(page.locator('.tlh .sim')).toBeVisible();
    await expect(page).toHaveScreenshot('waiting-dark.png');
  });

  for (const theme of ['dark', 'light']) {
    test(`done: the whole session at the end (${theme})`, async ({ page }) => {
      await open(page, '01', 'end', theme);
      await expect(page.locator('.node.s-done')).toHaveCount(4);
      await expect(page.locator('.node.s-done .diffbadge')).toHaveCount(4);
      await expect(page.locator('.card.result')).toContainText('Session completed');
      await expect(page.locator('.achip')).toHaveCount(0);
      await expect(page).toHaveScreenshot(`done-${theme}.png`);
    });
  }
});

test.describe('behaviour', () => {
  test('the timeline scrubs by pointer and steps by keyboard', async ({ page, request }) => {
    const r = await replayOf(request, '01');
    await open(page, '01', 0);
    const slider = page.getByRole('slider', { name: 'Session time' });
    const box = await slider.boundingBox();
    if (!box) throw new Error('no timeline');
    await page.mouse.click(box.x + box.width * 0.6, box.y + 12);
    const now = Number(await slider.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThan(r.duration * 0.4);
    expect(now).toBeLessThan(r.duration * 0.8);
    await slider.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', String(Math.round(r.ops[0]?.start ?? 0)));
  });

  test('Space plays the replay', async ({ page }) => {
    await open(page, '01', 0);
    const slider = page.getByRole('slider', { name: 'Session time' });
    await page.locator('.map').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(300);
  });

  test('prefers-reduced-motion stops every node animation', async ({ page, request }) => {
    const r = await replayOf(request, '02');
    const sh = find(r, (o) => o.kind === 'shell');
    const anim = () =>
      page
        .locator('.node.temp.s-running .prog')
        .evaluate((el) => getComputedStyle(el, '::after').animationName);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, '02', sh.start + 300);
    expect(await anim()).toBe('indet');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await anim()).toBe('none');
  });
});
