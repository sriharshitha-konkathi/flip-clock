'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.STILL_DEV_PORT || 5173);
const stillUrl = process.env.STILL_DEV_URL || `http://127.0.0.1:${port}`;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCandidates = [
  path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'),
  path.join(root, 'node_modules', 'electron', 'cli.js'),
];
const electronEntry = electronCandidates.find((candidate) => fs.existsSync(candidate));

if (!electronEntry) {
  console.error('Electron was not found. Install the project dev dependencies before running the desktop dev script.');
  process.exitCode = 1;
} else {
  let vite;
  let electron;
  let shuttingDown = false;

  function stopChild(child) {
    if (!child || child.killed) return;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  }

  function cleanup(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChild(electron);
    stopChild(vite);
    if (typeof exitCode === 'number') process.exitCode = exitCode;
  }

  function waitForVite(url, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        const request = http.get(url, (response) => {
          response.resume();
          if (response.statusCode && response.statusCode < 500) return resolve();
          retry();
        });
        request.on('error', retry);
        request.setTimeout(1000, () => {
          request.destroy();
          retry();
        });
      };
      const retry = () => {
        if (Date.now() >= deadline) return reject(new Error(`Vite did not become ready at ${url}`));
        setTimeout(poll, 150);
      };
      poll();
    });
  }

  async function start() {
    vite = spawn(npmCommand, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: root,
      env: { ...process.env, STILL_DEV_URL: stillUrl },
      stdio: 'inherit',
      windowsHide: true,
    });
    vite.once('error', (error) => {
      console.error(`Could not start Vite: ${error.message}`);
      cleanup(1);
    });

    try {
      await waitForVite(stillUrl);
    } catch (error) {
      console.error(error.message);
      cleanup(1);
      return;
    }

    const electronArgs = [path.join(root, 'electron', 'main.cjs'), ...process.argv.slice(2)];
    const useCliScript = electronEntry.endsWith('cli.js');
    electron = spawn(useCliScript ? process.execPath : electronEntry, useCliScript ? [electronEntry, ...electronArgs] : electronArgs, {
      cwd: root,
      env: { ...process.env, STILL_DEV_URL: stillUrl },
      stdio: 'inherit',
      windowsHide: false,
    });
    electron.once('error', (error) => {
      console.error(`Could not start Electron: ${error.message}`);
      cleanup(1);
    });
    electron.once('exit', (code, signal) => {
      if (!shuttingDown) cleanup(code === null ? 1 : code);
    });
  }

  process.once('SIGINT', () => cleanup(0));
  process.once('SIGTERM', () => cleanup(0));
  process.once('exit', () => cleanup());
  void start();
}
