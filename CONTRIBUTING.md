# Contributing to Still

Start with the [README](README.md) for requirements and local startup. This project does not yet have a selected license or a configured hosted repository; coordinate with the owner before publishing code or inviting external contributions.

## Local workflow

1. Install the documented Node.js version and run `npm ci` from the project root.
2. Start the browser preview or the two-terminal Electron development flow in the README.
3. Keep changes focused on one behavior. Once Git is initialized, use a branch for each change.
4. Add or update the nearest useful check, then record the checks actually run.
5. Review the diff before committing. Do not include generated packages or unrelated formatting changes.

Use npm rather than introducing a second package manager. Commit `package.json` and `package-lock.json` together when dependencies intentionally change. Do not regenerate the lockfile just for a documentation edit.

## Source conventions

- Follow `.editorconfig` and the surrounding code. `.gitattributes` keeps source text at LF while allowing Windows command scripts to use CRLF.
- TypeScript/React code lives under `src/`; Electron and Node helpers currently use CommonJS (`.cjs`). The screensaver launcher is C# under `windows/`.
- Edit source files, not generated `dist/`, `build/`, or `release/` output.
- Preserve `base: './'` in Vite configuration: packaged pages are loaded with `file://`.
- Keep one numeral per flip card. The top/bottom plates are decoration; they must not each render a full digit.
- Preserve keyboard access, useful accessible labels, responsive layouts, and reduced-motion behavior when changing the UI.
- Keep Electron context isolation and sandboxing enabled. Add narrowly scoped preload/IPC APIs rather than exposing Node or unrestricted `ipcRenderer` to the renderer.

## Before submitting a change

For code/configuration changes:

```sh
npm run typecheck
npm test
npm run build
node scripts/test-built-assets.cjs
```

For clock rendering, Electron, or packaging changes, also run on Windows:

```sh
npm run windows:pack
node scripts/test-packaged.cjs
```

For installer changes, run `npm run windows:build` and describe the installer steps actually exercised. The packaged UI smoke test does not test installing the NSIS package, changing Windows registry settings, or secure locking.

For visual changes, inspect the app as well as test assertions. In PowerShell, optional screenshots can be saved with:

```powershell
$env:STILL_TEST_SCREENSHOTS = "test-results/packaged"
node scripts/test-packaged.cjs
Remove-Item Env:STILL_TEST_SCREENSHOTS
```

`test-results/` is ignored by Git. Check desktop and narrow layouts, visible/hidden seconds, 12/24-hour time, and the screensaver view. For animation changes, check normal and reduced-motion settings.

For documentation-only changes, check relative links and ensure command examples match `package.json` and existing scripts. Do not claim a fresh install or platform check passed unless it was actually run.

### Current coverage limits

- `npm test` includes desktop argument checks; Vitest currently has no test files.
- `npm run test:e2e` does not yet have a configured Playwright suite. The standalone packaged test is the current UI smoke check.
- There is no lint script or CI workflow yet.
- Windows x64 is the verified packaging target. Report checks on other platforms separately.
- The combined `npm run desktop` helper has a known Windows `.cmd` spawning issue; use the README's two-terminal workaround.

## Reporting a bug

Include the following without private data:

- Expected behavior and what actually happened.
- Minimal reproduction steps and whether this is a browser, development Electron, or packaged-app issue.
- Windows version, app version, Node.js version, and the exact command used when relevant.
- Useful error output and screenshots, with personal paths and sensitive content removed.
- Whether the problem remains after rebuilding and closing older Still instances.

## Repository hygiene

Never commit secrets, `.env` settings, signing certificates/private keys, local agent notes, dependencies, installers, or generated test reports. `.gitignore` is a first line of defense, not a secret scanner. Review newly staged files and any intentional ignore-rule changes.

Keep local design references in the ignored `assets/external-samples/` directory. Before adding an image, font, or other asset to application source, confirm that its use and redistribution are permitted and include attribution where required.

Repository initialization and remote setup are covered in [docs/repository-setup.md](docs/repository-setup.md).
