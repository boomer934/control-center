// Phase 5b: the map of the Live view, driven by the recorded fixtures in the map lab
// (#/map-lab, only in the E2E build). Behaviour, visual states in both themes, and the
// performance budget: 60 fps with 500 nodes on the map and 20 events per second.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cc-map-'));
  ({ app, page } = await launchApp({ userDataDir }));
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => undefined);
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

async function setTheme(name: 'dark' | 'light') {
  await page.keyboard.press('Control+K');
  await page.getByTestId('palette-input').fill(`Theme: ${name}`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('status-theme-value')).toHaveText(name);
}

/** Opens a scene of the lab and waits until the map is laid out and fitted. */
async function scene(name: string) {
  await page.evaluate((n) => {
    window.location.hash = `#/map-lab?scene=${n}`;
  }, name);
  await expect(page.getByTestId('map-lab')).toHaveAttribute('data-scene', name);
  await expect(page.getByTestId('live-map')).toHaveAttribute('data-ready', 'true');
  // Two frames: the layout lands, then React Flow places the nodes.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

const node = (path: string) => page.locator(`[data-node="${path}"]`);
const chip = (code: string) => page.locator(`.achip[data-agent="${code}"]`);

test.describe('map states from the fixtures', () => {
  test('a read lights the file up and the agent chip points at it', async () => {
    await scene('reading');
    await expect(node('src/cart.js')).toHaveAttribute('data-state', 'reading');
    await expect(chip('CL')).toHaveAttribute('data-state', 'reading');
    // Files the session never touched stay in their collapsed folder.
    await expect(node('scripts/release.js')).toHaveCount(0);
    await expect(page.locator('[data-folder="scripts"]')).toBeVisible();
  });

  test('an edit shows writing, and the finished edits keep their diff', async () => {
    await scene('writing');
    await expect(node('test/cart.test.js')).toHaveAttribute('data-state', 'writing');
    await expect(node('src/index.js')).toHaveAttribute('data-state', 'done');
    await expect(node('src/index.js')).toContainText('+1');
  });

  test('a failing test run is an error on its command node', async () => {
    await scene('error');
    await expect(page.locator('[data-temp="command"]')).toHaveAttribute('data-state', 'error');
  });

  test('a permission request makes the agent wait', async () => {
    await scene('waiting');
    await expect(chip('CL')).toHaveAttribute('data-state', 'waiting');
    await expect(page.locator('[data-temp="command"]')).toHaveAttribute('data-state', 'waiting');
  });

  test('a subagent has its own chip on the file it reads', async () => {
    await scene('subagent');
    await expect(chip('GE')).toHaveAttribute('data-state', 'reading');
    await expect(node('src/inventory.js')).toHaveAttribute('data-state', 'reading');
  });

  test('a collapsed folder opens on click', async () => {
    await scene('reading');
    await page.locator('[data-folder="docs"]').click();
    await expect(node('docs/api.md')).toBeVisible();
  });

  test('hovering an edited file previews its diff', async () => {
    await scene('done');
    await node('src/cart.js').hover();
    await expect(page.getByTestId('map-diff')).toContainText('return Math.round');
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('map-diff')).toHaveCount(0);
  });

  test('F follows the agent, moving the map stops it, Esc clears the notice', async () => {
    await scene('writing');
    const map = page.getByTestId('live-map');
    await map.click({ position: { x: 8, y: 8 } });
    await page.keyboard.press('f');
    await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-pressed', 'true');
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 200);
    await expect(page.getByText('Following stopped')).toBeVisible();
    await expect(page.getByTestId('map-follow')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Following stopped')).toHaveCount(0);
  });
});

test.describe('map (visual)', () => {
  const scenes = ['empty', 'reading', 'writing', 'error', 'waiting', 'subagent', 'done'] as const;
  for (const mode of ['dark', 'light'] as const) {
    test(`every state looks as designed in the ${mode} theme`, async () => {
      await setTheme(mode);
      for (const name of scenes) {
        await scene(name);
        await page.mouse.move(0, 0);
        await expect
          .soft(page.getByTestId('live-map'))
          .toHaveScreenshot(`map-${name}-${mode}.png`, { animations: 'disabled', caret: 'hide' });
      }
      await setTheme('dark');
    });
  }
});

/** A frame longer than this missed at least one refresh at 60 Hz. */
const LONG_FRAME_MS = 25;

test.describe('map performance', () => {
  test('keeps 60 fps with 500 nodes and 20 events per second', async () => {
    await scene('bench');
    await expect(page.getByTestId('live-map')).toHaveAttribute('data-files', '500');
    const measure = (running: boolean, ms: number) =>
      page.evaluate(
        async ({ running, ms, long }) => {
          const bench = (window as unknown as { __mapBench: (on: boolean) => void }).__mapBench;
          bench(running);
          // Let the stream settle, then count frames.
          await new Promise((done) => setTimeout(done, 1000));
          const frames: number[] = [];
          await new Promise<void>((done) => {
            const start = performance.now();
            let last = start;
            const tick = (now: number) => {
              frames.push(now - last);
              last = now;
              if (now - start < ms) requestAnimationFrame(tick);
              else done();
            };
            requestAnimationFrame(tick);
          });
          bench(false);
          const total = frames.reduce((a, b) => a + b, 0);
          const sorted = [...frames].sort((a, b) => a - b);
          return {
            fps: (frames.length / total) * 1000,
            p95: sorted[Math.floor(sorted.length * 0.95)]!,
            longest: sorted.at(-1)!,
            longShare: frames.filter((f) => f > long).length / frames.length,
            nodes: document.querySelectorAll('.react-flow__node').length,
          };
        },
        { running, ms, long: LONG_FRAME_MS },
      );
    // The same map without events: what this machine's frame clock gives on its own. On the
    // Windows runner frames are paced by the 15.6 ms system timer, so about 7% of the frames of
    // an idle page last two ticks (31.2 ms) and a plain p95 can never reach 25 ms there.
    const idle = await measure(false, 3000);
    const busy = await measure(true, 5000);
    const describe = (r: typeof busy) =>
      `${r.fps.toFixed(1)} fps, p95 ${r.p95.toFixed(1)} ms, longest ${r.longest.toFixed(1)} ms, ` +
      `${(r.longShare * 100).toFixed(1)}% frames > ${LONG_FRAME_MS} ms`;
    test.info().annotations.push({
      type: 'performance',
      description: `events: ${describe(busy)}, ${busy.nodes} nodes rendered; idle: ${describe(idle)}`,
    });
    console.log(`map performance: events: ${describe(busy)}; idle: ${describe(idle)}`);
    expect(busy.nodes).toBeGreaterThanOrEqual(500);
    expect(busy.fps).toBeGreaterThanOrEqual(55);
    // The events may add at most 5% of long frames to what the idle map already has (a p95 of
    // 25 ms on a machine whose clock never misses).
    expect(busy.longShare).toBeLessThanOrEqual(idle.longShare + 0.05);
  });
});
