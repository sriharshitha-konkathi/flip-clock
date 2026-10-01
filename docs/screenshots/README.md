# App screenshots

These PNGs are intentional documentation assets, not disposable test output. Commit this directory with the root README so the relative image links render on Git hosting sites.

| File | View |
| --- | --- |
| [desktop.png](desktop.png) | Main clock with the default Ember accent |
| [settings.png](settings.png) | Preferences panel and Windows screensaver controls |
| [focus-mode.png](focus-mode.png) | Clock with the 25-minute focus timer open |
| [screensaver.png](screensaver.png) | Screensaver renderer without desktop controls |

The images are real captures of Still's packaged Windows renderer at **1440 × 1080**. The clock is held at **10:08:32 AM on October 2, 2026** for consistent documentation, with animations settled for each capture. A fresh temporary profile supplies default preferences; no personal settings, desktop background, taskbar, or local file paths are included. The screensaver screenshot shows the app's `#screensaver` route, not the native Windows control-panel preview or secure lock screen.

## Refresh after UI changes

From the project root on Windows, with the normal development dependencies installed:

```sh
npm run windows:pack
node scripts/capture-screenshots.cjs
```

If the package already matches the current source, only the second command is needed. The capture helper uses the existing Playwright and Electron dependencies; it does not require an extra browser installation. It overwrites the four named PNGs, closes its own app instance, and removes its temporary profile. It does not modify your installed app's preferences or register a Windows screensaver.

Google Fonts are optional runtime resources. Capture while online for the intended fonts; if they cannot be fetched, the app's normal fallback fonts may appear.

Inspect all four images before committing. Keep routine test screenshots in the ignored `test-results/` directory instead of adding them here. See the [main README](../../README.md) and [contribution checks](../../CONTRIBUTING.md) for more context.
