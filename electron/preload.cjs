'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const desktop = {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  startScreensaver: () => ipcRenderer.invoke('desktop:start-screensaver'),
  installScreensaver: () => ipcRenderer.invoke('desktop:install-screensaver'),
  openScreensaverSettings: () => ipcRenderer.invoke('desktop:open-screensaver-settings'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('desktop:set-always-on-top', Boolean(enabled)),
  setPreventSleep: (enabled) => ipcRenderer.invoke('desktop:set-prevent-sleep', Boolean(enabled)),
  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, isFullscreen) => callback(Boolean(isFullscreen));
    ipcRenderer.on('desktop:fullscreen-change', listener);
    return () => ipcRenderer.removeListener('desktop:fullscreen-change', listener);
  },
};

contextBridge.exposeInMainWorld('stillDesktop', desktop);

// BrowserWindow's before-input-event handles keyboard and button input. The
// renderer listener additionally sees mouse movement and protects against the
// pointer jitter Windows commonly generates as the saver opens.
const startedAt = Date.now();
const mouseGraceMs = 1200;
const jitterPixels = 12;
let initialPointer = null;
let inputSent = false;

function sendSaverInput(kind) {
  if (inputSent) return;
  inputSent = true;
  ipcRenderer.send('screensaver:input', kind);
}

document.addEventListener('keydown', () => sendSaverInput('key'), true);
document.addEventListener('mousedown', () => sendSaverInput('mouse'), true);
document.addEventListener('pointerdown', () => sendSaverInput('mouse'), true);
document.addEventListener('touchstart', () => sendSaverInput('touch'), true);
document.addEventListener('mousemove', (event) => {
  const point = { x: event.screenX, y: event.screenY };
  if (initialPointer === null) {
    initialPointer = point;
    return;
  }
  if (Date.now() - startedAt < mouseGraceMs) return;
  const distance = Math.hypot(point.x - initialPointer.x, point.y - initialPointer.y);
  if (distance >= jitterPixels) sendSaverInput('mouse');
}, true);
