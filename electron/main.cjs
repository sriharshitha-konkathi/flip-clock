'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerSaveBlocker,
  screen,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { fileURLToPath } = require('node:url');
const { parseLaunchArgs } = require('./launch-args.cjs');

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const projectRoot = path.resolve(__dirname, '..');
const devUrl = getDevUrl();
const productionIndex = path.join(projectRoot, 'dist', 'index.html');

let mainWindow = null;
let saverSession = null;
let preventSleepBlocker = null;
let preventSleepRequested = false;
let isQuitting = false;
let pendingSecondInstance = null;

function getDevUrl() {
  const candidate = process.env.STILL_DEV_URL || 'http://127.0.0.1:5173';
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
      throw new Error('STILL_DEV_URL must point to a local HTTP server');
    }
    return parsed;
  } catch (error) {
    console.warn(`[Still] Ignoring invalid STILL_DEV_URL: ${error.message}`);
    return new URL('http://127.0.0.1:5173');
  }
}

function isPackaged() {
  return app.isPackaged;
}

function isSaverWindow(window) {
  return Boolean(saverSession && saverSession.windows.has(window));
}

function isKnownWindowContents(contents) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents === contents) return true;
  if (saverSession) {
    for (const window of saverSession.windows) {
      if (!window.isDestroyed() && window.webContents === contents) return true;
    }
  }
  return false;
}

function isAllowedNavigation(urlString) {
  try {
    const target = new URL(urlString);
    if (!isPackaged()) {
      return target.origin === devUrl.origin;
    }
    if (target.protocol !== 'file:') return false;
    const targetPath = path.normalize(fileURLToPath(target));
    const distPath = path.normalize(path.dirname(productionIndex));
    return targetPath === path.normalize(productionIndex) || targetPath.startsWith(`${distPath}${path.sep}`);
  } catch {
    return false;
  }
}

function attachNavigationGuards(window) {
  const preventExternalNavigation = (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  };
  window.webContents.on('will-navigate', preventExternalNavigation);
  window.webContents.on('will-redirect', preventExternalNavigation);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createWebPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    enableRemoteModule: false,
  };
}

async function loadView(window, route = '') {
  if (!isPackaged()) {
    const target = new URL(devUrl.toString());
    target.hash = route ? `#${route}` : '';
    await window.loadURL(target.toString());
    return;
  }
  await window.loadFile(productionIndex, route ? { hash: route } : undefined);
}

function notifyFullscreen(window) {
  if (!window.isDestroyed()) {
    window.webContents.send('desktop:fullscreen-change', window.isFullScreen());
  }
}

function configureCommonWindowEvents(window, { showWhenReady = false } = {}) {
  attachNavigationGuards(window);
  window.on('enter-full-screen', () => notifyFullscreen(window));
  window.on('leave-full-screen', () => notifyFullscreen(window));
  window.webContents.on('before-input-event', (_event, input) => {
    if (!isSaverWindow(window)) return;
    if (input.type === 'keyDown' || input.type === 'mouseDown' || input.type === 'touchStart') {
      closeScreensaver('input');
    }
  });
  if (showWhenReady) {
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) window.show();
    });
  }
}

function createMainWindow(route = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    if (route) void loadView(mainWindow, route).catch(reportLoadError);
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 700,
    minHeight: 520,
    backgroundColor: '#101114',
    show: false,
    title: 'Still',
    webPreferences: createWebPreferences(),
  });
  mainWindow = window;
  configureCommonWindowEvents(window, { showWhenReady: true });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  void loadView(window, route).catch(reportLoadError);
  return window;
}

function reportLoadError(error) {
  console.error(`[Still] Could not load the desktop UI: ${error.message}`);
}

function resolveScreensaverPath() {
  const candidates = [];
  if (isPackaged()) {
    candidates.push(path.join(path.dirname(process.execPath), 'Still.scr'));
  }
  candidates.push(path.join(projectRoot, 'build', 'Still.scr'));
  candidates.push(path.join(path.dirname(process.execPath), 'Still.scr'));
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function ensurePreventSleep(enabled, { automatic = false } = {}) {
  if (enabled) {
    if (preventSleepBlocker === null) {
      preventSleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
    }
    if (!automatic) preventSleepRequested = true;
    return powerSaveBlocker.isStarted(preventSleepBlocker);
  }
  if (!automatic) preventSleepRequested = false;
  if (!preventSleepRequested && preventSleepBlocker !== null) {
    powerSaveBlocker.stop(preventSleepBlocker);
    preventSleepBlocker = null;
  }
  return preventSleepBlocker === null;
}

function closeScreensaver(reason = 'closed') {
  if (!saverSession || saverSession.closing) return;
  const session = saverSession;
  session.closing = true;
  saverSession = null;
  for (const window of session.windows) {
    if (!window.isDestroyed()) window.destroy();
  }
  if (session.autoPreventSleep && !preventSleepRequested) ensurePreventSleep(false, { automatic: true });

  if (session.returnToMain && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else if (session.quitOnClose && !isQuitting) {
    app.quit();
  }
  if (reason !== 'input') console.info(`[Still] Screensaver closed (${reason}).`);
}

async function startScreensaver({ cli = false } = {}) {
  if (!isWindows) throw new Error('The Windows screensaver is only available on Windows.');
  if (saverSession && saverSession.windows.size > 0) return;

  const displays = screen.getAllDisplays();
  if (displays.length === 0) throw new Error('No display is available for the screensaver.');
  const returnToMain = !cli && Boolean(mainWindow && !mainWindow.isDestroyed());
  saverSession = {
    windows: new Set(),
    returnToMain,
    quitOnClose: cli,
    closing: false,
    autoPreventSleep: !preventSleepRequested,
  };

  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  if (!preventSleepRequested) ensurePreventSleep(true, { automatic: true });

  const session = saverSession;
  try {
    for (const display of displays) {
      if (saverSession !== session) return;
      const { x, y, width, height } = display.bounds;
      const window = new BrowserWindow({
        x,
        y,
        width,
        height,
        frame: false,
        fullscreen: false,
        kiosk: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        skipTaskbar: true,
        focusable: true,
        show: false,
        backgroundColor: '#000000',
        webPreferences: createWebPreferences(),
      });
      window.setBounds(display.bounds);
      window.setAlwaysOnTop(true, 'screen-saver');
      saverSession.windows.add(window);
      configureCommonWindowEvents(window, { showWhenReady: true });
      window.on('closed', () => {
        if (saverSession && saverSession.windows.has(window)) saverSession.windows.delete(window);
      });
      await loadView(window, 'screensaver');
      if (saverSession !== session) return;
    }
    for (const window of session.windows) {
      if (!window.isDestroyed()) window.show();
    }
    const firstWindow = session.windows.values().next().value;
    if (firstWindow && !firstWindow.isDestroyed()) firstWindow.focus();
  } catch (error) {
    closeScreensaver('load failure');
    throw error;
  }
}

function getInfo() {
  return {
    platform: process.platform,
    version: app.getVersion(),
    packaged: isPackaged(),
    screensaverAvailable: isWindows && fs.existsSync(resolveScreensaverPath()),
  };
}

async function installScreensaver() {
  if (!isWindows) return { ok: false, message: 'Screensaver installation is available on Windows only.' };
  const screensaverPath = resolveScreensaverPath();
  if (!fs.existsSync(screensaverPath)) {
    return {
      ok: false,
      message: `Still.scr was not found. Build it first (expected at ${screensaverPath}).`,
    };
  }

  const confirmation = await dialog.showMessageBox({
    type: 'question',
    title: 'Install Still screensaver?',
    message: 'Register Still as your Windows screensaver?',
    detail: `This changes your current-user screensaver settings. No system-wide settings will be changed.\n\n${screensaverPath}`,
    buttons: ['Install', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) return { ok: false, message: 'Screensaver installation cancelled.' };

  try {
    const registryKey = 'HKCU\\Control Panel\\Desktop';
    await execFileAsync('reg.exe', ['ADD', registryKey, '/v', 'SCRNSAVE.EXE', '/t', 'REG_SZ', '/d', screensaverPath, '/f'], { windowsHide: true });
    await execFileAsync('reg.exe', ['ADD', registryKey, '/v', 'ScreenSaveActive', '/t', 'REG_SZ', '/d', '1', '/f'], { windowsHide: true });
    await execFileAsync('reg.exe', ['ADD', registryKey, '/v', 'ScreenSaverIsSecure', '/t', 'REG_SZ', '/d', '1', '/f'], { windowsHide: true });
    return { ok: true, message: 'Still is now registered as the current-user screensaver.' };
  } catch (error) {
    return { ok: false, message: `Windows could not update the screensaver settings: ${error.message}` };
  }
}

async function openScreensaverSettings() {
  if (!isWindows) throw new Error('Windows screensaver settings are only available on Windows.');
  await execFileAsync('control.exe', ['desk.cpl,,@screensaver'], { windowsHide: true });
}

function registerIpc() {
  ipcMain.handle('desktop:get-info', (event) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    return getInfo();
  });
  ipcMain.handle('desktop:toggle-fullscreen', (event) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    const window = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!window || isSaverWindow(window)) return false;
    const nextValue = !window.isFullScreen();
    window.setFullScreen(nextValue);
    return nextValue;
  });
  ipcMain.handle('desktop:start-screensaver', (event) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    return startScreensaver({ cli: false });
  });
  ipcMain.handle('desktop:install-screensaver', (event) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    return installScreensaver();
  });
  ipcMain.handle('desktop:open-screensaver-settings', (event) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    return openScreensaverSettings();
  });
  ipcMain.handle('desktop:set-always-on-top', (event, enabled) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    const value = Boolean(enabled);
    if (saverSession) {
      for (const window of saverSession.windows) {
        if (!window.isDestroyed()) window.setAlwaysOnTop(value, value ? 'screen-saver' : 'normal');
      }
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(value);
    return value;
  });
  ipcMain.handle('desktop:set-prevent-sleep', (event, enabled) => {
    if (!isKnownWindowContents(event.sender)) throw new Error('Unknown desktop window.');
    return ensurePreventSleep(Boolean(enabled));
  });
  ipcMain.on('screensaver:input', (event, kind) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && isSaverWindow(window) && ['key', 'mouse', 'touch'].includes(kind)) closeScreensaver('input');
  });
}

function handleSecondInstance(commandLine) {
  const flags = parseLaunchArgs(commandLine);
  if (flags.screensaver) {
    void startScreensaver({ cli: true }).catch((error) => {
      console.error(`[Still] Could not start screensaver: ${error.message}`);
      if (!mainWindow) app.quit();
    });
    return;
  }

  // A normal launch or settings request is an explicit request to get back to
  // the desktop UI, even if the existing single instance is currently in the
  // command-line saver mode.
  if (saverSession) {
    saverSession.quitOnClose = false;
    closeScreensaver('desktop request');
  }
  createMainWindow(flags.settings ? 'settings' : '');
}

const launchFlags = parseLaunchArgs(process.argv);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (!app.isReady()) pendingSecondInstance = commandLine;
    else handleSecondInstance(commandLine);
  });

  app.whenReady().then(() => {
    registerIpc();
    if (launchFlags.screensaver) {
      void startScreensaver({ cli: true }).catch((error) => {
        console.error(`[Still] Could not start screensaver: ${error.message}`);
        app.quit();
      });
    } else {
      createMainWindow(launchFlags.settings ? 'settings' : '');
    }
    if (pendingSecondInstance) {
      handleSecondInstance(pendingSecondInstance);
      pendingSecondInstance = null;
    }
  });

  app.on('activate', () => {
    if (!mainWindow && !saverSession) createMainWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (saverSession) closeScreensaver('application quit');
    if (preventSleepBlocker !== null) {
      powerSaveBlocker.stop(preventSleepBlocker);
      preventSleepBlocker = null;
    }
  });

  app.on('window-all-closed', () => {
    if (!isMac && !saverSession) app.quit();
  });
}

module.exports = { parseLaunchArgs };
