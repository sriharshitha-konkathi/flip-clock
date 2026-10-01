# Still on Windows

Still's Windows shell lives in `electron/`, with a native screensaver launcher in `windows/`. See the [README](../README.md) for requirements and first-time setup. The React UI remains the source of the routes: the desktop shell opens the normal app at `/`, preferences at `#settings`, and the immersive saver at `#screensaver`.

## Development

The desktop entry point is `electron/main.cjs`. It uses:

- `STILL_DEV_URL`, defaulting to `http://127.0.0.1:5173`, when the app is not packaged;
- `dist/index.html` when packaged;
- a sandboxed, context-isolated preload (`electron/preload.cjs`) with no Node integration;
- a normal 1280x850 dark window with a 700x520 minimum size.

After `npm ci`, use two terminals for a reliable Windows development session:

```powershell
# Terminal 1
npm run dev -- --port 5173 --strictPort
```

```powershell
# Terminal 2
node node_modules/electron/cli.js .
# Or, to open preferences directly:
# node node_modules/electron/cli.js . --settings
```

The combined `npm run desktop` helper is intended to start and clean up both processes, but currently fails with `spawn EINVAL` on Windows when it spawns `.cmd` wrappers. The two-terminal flow bypasses those wrappers. Close the app and stop Vite separately when finished. The UI can use the allow-listed `window.stillDesktop` API supplied by the preload.

### Optional environment variables

No environment configuration is required for the default flow.

| Variable | Purpose |
| --- | --- |
| `STILL_DEV_URL` | Electron's local renderer URL; defaults to `http://127.0.0.1:5173`. Only loopback HTTP(S) URLs are accepted. |
| `STILL_DEV_PORT` | Port requested by the combined development helper; defaults to `5173`. For the manual flow, pass Vite's `--port` and set the matching `STILL_DEV_URL` in the Electron terminal instead. |
| `STILL_TEST_SCREENSHOTS` | Optional output directory for screenshots from `scripts/test-packaged.cjs`; prefer the ignored `test-results/` directory. |

Set these as process environment variables (for example, `$env:STILL_DEV_URL = "http://127.0.0.1:5174"` in PowerShell). The Electron/Node scripts do not automatically load `.env` files.

## Building

The root `package.json` already defines the build commands. After installing dependencies with `npm ci`, run on Windows:

```powershell
# Typecheck, build the renderer and Still.scr, then package an unpacked app
npm run windows:pack

# Or build the same app plus its NSIS installer
npm run windows:build
```

The unpacked app is `release/win-unpacked/Still.exe`; the installer is `release/Still-<version>-setup.exe`. Keep the unpacked app's adjacent resources together. `electron-builder` and Electron are development dependencies installed by `npm ci`; no separate global install is needed. Native screensaver compilation requires the .NET Framework tools described in the README.

Generated `build/`, `dist/`, and `release/` output is excluded from Git. Source files, build configuration, and the npm lockfile should be committed.

`node scripts/test-desktop.cjs` runs focused allow-list checks for `--settings`/`--screensaver` handling. `node scripts/build-screensaver.cjs` compiles `windows/StillScreenSaver.cs` to `build/Still.scr` using the installed .NET Framework `Framework64\\v4.0.30319\\csc.exe` (with the 32-bit Framework fallback). It does not require the .NET SDK. If `csc.exe` is missing, the script exits with the exact locations it checked. An NSIS build copies `Still.scr` next to `Still.exe` using `extraFiles`.

## Checking the packaged UI

Vite must use `base: './'` in `vite.config.ts`. The packaged app opens `dist/index.html` through `file://`; root-relative `/assets/...` URLs resolve to the drive root instead of the bundled assets and leave an empty dark window.

After building, run:

```powershell
node scripts/test-built-assets.cjs
node scripts/test-packaged.cjs
```

The first check verifies the generated JavaScript and CSS URLs resolve to files within `dist/`. The second uses the project's existing Playwright dependency to launch `release/win-unpacked/Still.exe` with a temporary profile, then checks the styled, ticking clock, settings controls, and `#screensaver` renderer. It also checks that each flip card contains only one numeral (covering 0–9), that the numeral spans both decorative halves at compact and desktop widths, and that hiding seconds or using 24-hour time does not duplicate digits. Set `STILL_TEST_SCREENSHOTS` to an output directory to save desktop, compact, and screensaver screenshots for visual inspection.

The test closes the app and removes the temporary profile, without changing Windows screensaver settings. Run `npm run windows:pack` or `npm run windows:build` before the packaged test; it checks the existing executable, not unbuilt source edits.

To try the fix manually, close any older Still instance and open `release/win-unpacked/Still.exe`. To update an installed copy, run the rebuilt `release/Still-1.0.0-setup.exe`; rebuilding `dist/` alone does not update an already-installed application.

## Screensaver commands

Windows invokes the adjacent `Still.scr` with standard commands:

- `/s`: starts `Still.exe --screensaver`, holds a named mutex while it runs, and waits for the app to exit;
- `/c`: starts `Still.exe --settings`;
- `/p HWND`: embeds a small native WinForms clock preview directly in the supplied control window. The preview does not require the Electron app or an external runtime.

The launcher resolves `Still.exe` next to the `.scr`, with a portable-layout parent-directory fallback. Missing files, malformed preview handles, unsupported command modes, and startup failures produce a clear error instead of running an unsafe command. The Electron app also has a single-instance lock: a later `--settings` opens the existing app's preferences, while a later `--screensaver` starts the saver in that process.

The true saver mode creates one borderless always-on-top window per display, loads `#screensaver`, and exits on keyboard, button, touch, or meaningful pointer movement. The first roughly 1.2 seconds of mouse movement and movement under 12 pixels are ignored to avoid the Windows pointer jitter that occurs during activation. A saver started from inside Still hides the normal window and restores it after input; the command-line saver exits instead.

## Desktop bridge and installation behavior

`window.stillDesktop` exposes:

- `getInfo()` -> `{ platform, version, packaged, screensaverAvailable }`;
- `toggleFullscreen()`;
- `startScreensaver()`;
- `installScreensaver()`;
- `openScreensaverSettings()`;
- `setAlwaysOnTop(enabled)`;
- `setPreventSleep(enabled)`;
- `onFullscreenChange(callback)` -> unsubscribe function.

Navigation is limited to the loopback dev origin or packaged `dist` files, and popup creation is denied. The preload does not expose `ipcRenderer` or filesystem access.

`installScreensaver()` first checks for `Still.scr`, then displays an explicit confirmation dialog. Only after the user chooses **Install** does it use `reg.exe` to set these **current-user** values under `HKCU\\Control Panel\\Desktop`:

- `SCRNSAVE.EXE` to the resolved `Still.scr` path;
- `ScreenSaveActive` to `1`;
- `ScreenSaverIsSecure` to `1`.

Cancel, a missing launcher, a non-Windows OS, or a registry error makes no registration attempt (a registry failure after an accepted install can leave earlier values changed). `openScreensaverSettings()` opens the Windows screensaver control panel.

`ScreenSaverIsSecure=1` only requests Windows' normal secure screensaver behavior. Still is not a replacement for the Windows lock screen, credential provider, or other security boundary. It cannot guarantee protection from a user with administrative access, and it should not be advertised as a secure lock-screen replacement.
