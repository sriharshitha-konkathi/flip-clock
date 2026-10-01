'use strict';

// Capture the real packaged renderer using a disposable profile, never the
// user's preferences. Run `npm run windows:pack` first after changing the UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'screenshots');

async function capture(page, name) {
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.locator('.digit-card__value')).toHaveText(['1', '0', '0', '8', '3', '2']);
  // Let the optional web fonts finish loading; normal fallback fonts remain
  // valid when offline. Do not inject screenshot-specific application styles.
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  const destination = path.join(output, `${name}.png`);
  await page.screenshot({ path: destination, animations: 'disabled', caret: 'hide', scale: 'css' });
  console.log(`Saved ${path.relative(root, destination)} (${Math.round(fs.statSync(destination).size / 1024)} KiB)`);
}

async function main() {
  const executablePath = path.join(root, 'release', 'win-unpacked', 'Still.exe');
  assert.ok(fs.existsSync(executablePath), 'Run npm run windows:pack before capturing screenshots.');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'still-screenshots-'));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], env, timeout: 30000 });
    const page = await app.firstWindow({ timeout: 15000 });
    assert.equal((await page.evaluate(() => window.stillDesktop.getInfo())).packaged, true);
    await page.setViewportSize({ width: 1440, height: 1080 });
    // A fixed local demo time keeps captures consistent across runs/time zones.
    const time = await page.evaluate(() => new Date(2026, 9, 2, 10, 8, 32).getTime());
    await page.clock.setFixedTime(time);
    await capture(page, 'desktop');

    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await capture(page, 'settings');
    await page.getByRole('button', { name: 'close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'focus mode', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Focus timer' })).toBeVisible();
    await capture(page, 'focus-mode');
    await page.getByRole('button', { name: 'Close focus mode' }).click();

    // Render the screensaver route without opening kiosk windows on every
    // monitor or registering/changing a Windows screensaver.
    const url = new URL(page.url());
    url.hash = 'screensaver';
    await page.goto(url.href);
    await page.reload();
    await page.clock.setFixedTime(time);
    await expect(page.locator('.saver-mode')).toBeVisible();
    await expect(page.locator('.topbar')).toHaveCount(0);
    await capture(page, 'screensaver');
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
