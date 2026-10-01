'use strict';

const assert = require('node:assert/strict');
const { parseLaunchArgs } = require('../electron/launch-args.cjs');

assert.deepEqual(parseLaunchArgs([]), { screensaver: false, settings: false });
assert.deepEqual(parseLaunchArgs(['Still.exe', '--settings']), { screensaver: false, settings: true });
assert.deepEqual(parseLaunchArgs(['--screensaver']), { screensaver: true, settings: false });
assert.deepEqual(parseLaunchArgs(['--screensaver=1', '--settings=true']), { screensaver: false, settings: false });
assert.deepEqual(parseLaunchArgs(['--settings', '--screensaver']), { screensaver: true, settings: true });

console.log('desktop launch argument checks passed');
