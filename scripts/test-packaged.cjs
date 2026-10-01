'use strict';

// Uses the existing Playwright dependency and a fresh, disposable user profile.
// Run `npm run windows:pack` or `npm run windows:build` first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron, expect } = require('@playwright/test');

async function checkSingleDigits(page) {
  const digits = await page.locator('.digit-card').allTextContents();
  for (const digit of digits) {
    assert.match(digit, /^\d$/, `Each flip card must render one numeral, not duplicated halves: ${digit}`);
  }
}

async function screenshot(page, name) {
  if (!process.env.STILL_TEST_SCREENSHOTS) return;
  const directory = path.resolve(process.env.STILL_TEST_SCREENSHOTS);
  fs.mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), animations: 'disabled' });
}

async function main() {
  const executablePath = path.resolve(__dirname, '..', 'release', 'win-unpacked', 'Still.exe');
  assert.ok(fs.existsSync(executablePath), 'Build the Windows package before running this smoke test.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'still-packaged-test-'));
  const env = { ...process.env };
  // Do not let a Node-based runner change the packaged Electron runtime.
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], env, timeout: 30000 });
    const errors = [];
    app.context().on('page', (page) => {
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => {
        if (request.url().startsWith('file:')) errors.push(`Failed local asset: ${request.url()}`);
      });
    });
    const page = await app.firstWindow({ timeout: 15000 });
    const clock = page.getByRole('timer');
    await expect(clock).toBeVisible();
    await expect(page.locator('.digit-card')).toHaveCount(6);
    await screenshot(page, 'desktop');
    await checkSingleDigits(page);
    assert.ok(page.url().startsWith('file:'), 'Test must load packaged files, not the dev server.');
    assert.equal((await page.evaluate(() => window.stillDesktop.getInfo())).packaged, true);
    assert.equal(await page.locator('.app-shell').evaluate((element) => getComputedStyle(element).display), 'flex');
    const initialTime = await clock.getAttribute('aria-label');
    await expect.poll(() => clock.getAttribute('aria-label')).not.toBe(initialTime);

    // Together these times cover all ten numerals without waiting a full minute.
    for (const [hours, minutes, seconds, digits] of [
      [8, 12, 34, ['0', '8', '1', '2', '3', '4']],
      [9, 56, 7, ['0', '9', '5', '6', '0', '7']],
    ]) {
      const time = await page.evaluate(([h, m, s]) => new Date(2026, 0, 2, h, m, s).getTime(), [hours, minutes, seconds]);
      await page.clock.setFixedTime(time);
      await expect(page.locator('.digit-card')).toHaveText(digits);
    }

    const desktopSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    for (const width of [390, 700, 701, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await checkSingleDigits(page);
      await expect(page.locator('.digit-card__value')).toHaveCount(6);
      const centered = await page.locator('.digit-card__value').evaluateAll((values) => values.every((value) => {
        const text = value.getBoundingClientRect();
        const card = value.parentElement.getBoundingClientRect();
        return Math.abs(text.height - card.height) < 1 && Math.abs(text.top - card.top) < 1;
      }));
      assert.ok(centered, `Numerals must span the whole card, not one half, at ${width}px.`);
      if (width === 390) await screenshot(page, 'compact');
    }
    await page.setViewportSize(desktopSize);

    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('switch', { name: 'Show seconds', exact: true }).click();
    await expect(page.locator('.digit-card')).toHaveCount(4);
    await checkSingleDigits(page);
    await page.getByRole('switch', { name: '24-hour time', exact: true }).click();
    await expect(page.locator('.meridiem')).toHaveCount(0);
    await checkSingleDigits(page);
    await page.getByRole('switch', { name: 'Show seconds', exact: true }).click();
    await expect(page.locator('.digit-card')).toHaveCount(6);
    await checkSingleDigits(page);

    // Exercise the saver renderer without covering every monitor or changing
    // Windows' screensaver settings. Native screensaver registration is not tested.
    const saverUrl = new URL(page.url());
    saverUrl.hash = 'screensaver';
    await page.goto(saverUrl.href);
    await page.reload();
    await expect(page.locator('.saver-mode')).toBeVisible();
    await expect(clock).toBeVisible();
    await expect(page.locator('.digit-card')).toHaveCount(6);
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await checkSingleDigits(page);
    await screenshot(page, 'screensaver');
    assert.deepEqual(errors, [], 'Renderer must not crash or fail to load bundled files.');
    console.log('Packaged Windows smoke test passed: single numerals (0–9), responsive layout, ticking time, settings, and screensaver view.');
  } finally {
    try {
      if (app) await app.close();
    } finally {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
