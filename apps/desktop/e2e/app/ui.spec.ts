// Interface of phase 3c: layout, command palette, shortcuts with focus scopes, themes, and the
// visual tests of the components page.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cc-ui-'));
  ({ app, page } = await launchApp({ userDataDir }));
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => undefined);
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

const theme = () => page.evaluate(() => document.documentElement.dataset.theme);

async function setTheme(name: 'system' | 'dark' | 'light') {
  await page.keyboard.press('Control+K');
  await page.getByTestId('palette-input').fill(`Theme: ${name}`);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('palette')).toHaveCount(0);
  await expect(page.getByTestId('status-theme-value')).toHaveText(name);
}

test.describe('shell layout', () => {
  test('has the activity bar, the status bar and the right dock', async () => {
    await expect(page.getByTestId('activity-bar')).toBeVisible();
    await expect(page.getByTestId('status-bar')).toBeVisible();
    await expect(page.getByTestId('right-dock')).toBeVisible();
  });

  test('Ctrl+Alt+B hides and shows the right dock', async () => {
    await page.keyboard.press('Control+Alt+B');
    await expect(page.getByTestId('right-dock')).toHaveCount(0);
    await page.keyboard.press('Control+Alt+B');
    await expect(page.getByTestId('right-dock')).toBeVisible();
  });

  test('Ctrl+3 goes to Local agents and Ctrl+1 back to Live', async () => {
    await page.keyboard.press('Control+3');
    await expect(page.getByTestId('view-local')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Local agents' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.keyboard.press('Control+1');
    await expect(page.getByTestId('app-info')).toBeVisible();
  });
});

test.describe('command palette and themes', () => {
  test('Ctrl+K opens the palette and Escape closes it', async () => {
    await page.keyboard.press('Control+K');
    await expect(page.getByTestId('palette')).toBeVisible();
    await expect(page.getByTestId('palette-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('palette')).toHaveCount(0);
  });

  test('Ctrl+Shift+P opens it too, and the palette command changes the theme', async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(page.getByTestId('palette')).toBeVisible();
    await page.keyboard.press('Escape');

    await setTheme('light');
    expect(await theme()).toBe('light');
    await setTheme('dark');
    expect(await theme()).toBe('dark');
  });

  test('the theme survives a reload', async () => {
    await setTheme('light');
    await page.reload();
    await expect(page.getByTestId('app-info')).toBeVisible();
    expect(await theme()).toBe('light');
    await setTheme('dark');
  });

  test('"system" follows the colour scheme of the OS', async () => {
    await setTheme('system');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(theme).toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(theme).toBe('dark');
    await setTheme('dark');
  });

  test('the status bar button cycles the theme preference', async () => {
    await setTheme('dark');
    await page.getByTestId('status-theme').click();
    await expect(page.getByTestId('status-theme-value')).toHaveText('light');
    await setTheme('dark');
  });

  test('the palette runs a navigation command', async () => {
    await page.keyboard.press('Control+K');
    await page.getByTestId('palette-input').fill('components');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('components-page')).toBeVisible();
    await page.keyboard.press('Control+1');
  });
});

test.describe('shortcuts and focus scopes', () => {
  test('? opens the shortcut list and Escape closes it', async () => {
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-help')).toBeVisible();
    await expect(page.getByTestId('shortcut-help')).toContainText('Ctrl+Shift+P');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcut-help')).toHaveCount(0);
  });

  test('Tab stays inside an open dialog and focus returns to where it was', async () => {
    await page.getByRole('link', { name: 'Infra' }).focus();
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcut-help')).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () =>
          document
            .querySelector('[data-testid="shortcut-help"]')
            ?.contains(document.activeElement) ?? false,
      );
      expect(inside).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Infra' })).toBeFocused();
  });

  test('a plain key does not fire inside a text field', async () => {
    await page.keyboard.press('Control+K');
    await page.getByTestId('palette-input').fill('?');
    await expect(page.getByTestId('shortcut-help')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('inside the terminal scope only the global shortcuts pass', async () => {
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.setAttribute('data-focus-scope', 'terminal');
      box.innerHTML = '<textarea id="fake-term"></textarea>';
      document.body.append(box);
    });
    await page.locator('#fake-term').focus();
    await page.keyboard.press('Control+K'); // captured by the terminal
    await expect(page.getByTestId('palette')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+P'); // always global
    await expect(page.getByTestId('palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('[data-focus-scope="terminal"]')?.remove());
  });

  test('Ctrl+Shift+M and the status bar show and hide Problems', async () => {
    await page.keyboard.press('Control+Shift+M');
    await expect(page.getByTestId('status-errors')).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('status-errors').click();
    await expect(page.getByTestId('status-errors')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('focus visibility', () => {
  test('a focused text input shows the focus ring on its frame', async () => {
    await page.keyboard.press('Control+K');
    await page.getByTestId('palette-input').fill('components');
    await page.keyboard.press('Enter');
    const field = page.getByLabel('Ollama URL');
    await field.focus();
    const outline = await field.evaluate(
      (el) => getComputedStyle(el.closest('.input') as Element).outlineStyle,
    );
    expect(outline).toBe('solid');
    await page.keyboard.press('Control+1');
  });
});

test.describe('components page (visual)', () => {
  const sections = ['states', 'agents', 'buttons', 'kbd', 'inputs', 'chips'] as const;

  for (const mode of ['dark', 'light'] as const) {
    test(`every section looks as designed in the ${mode} theme`, async () => {
      await setTheme(mode);
      await page.keyboard.press('Control+K');
      await page.getByTestId('palette-input').fill('components');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('components-page')).toBeVisible();
      // Nothing may move or be hovered while the screenshots are taken.
      await page.mouse.move(0, 0);
      for (const id of sections) {
        await expect.soft(page.getByTestId(`gal-${id}`)).toHaveScreenshot(`${id}-${mode}.png`, {
          animations: 'disabled',
          caret: 'hide',
        });
      }
      await page.keyboard.press('Control+1');
      await setTheme('dark');
    });
  }
});
