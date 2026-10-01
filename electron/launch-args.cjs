'use strict';

/**
 * Parse only the flags that the desktop shell owns. Keeping this parser
 * allow-listed prevents arbitrary command-line values from becoming actions.
 */
function parseLaunchArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  return {
    screensaver: args.some((arg) => arg === '--screensaver'),
    settings: args.some((arg) => arg === '--settings'),
  };
}

module.exports = { parseLaunchArgs };
