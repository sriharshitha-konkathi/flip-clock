# Preparing the first Git repository

The project is ready to be versioned, but the preparation itself does not initialize Git, stage files, make commits, create a remote, or publish anything. Run the following steps only when you are ready, from the project root.

## 1. Decide what will be published

- Choose a repository owner, name, and visibility. A private repository is a sensible starting point while licensing and release details are undecided.
- Choose a project license before a public release or granting reuse rights. No license has been selected for you.
- Review source and documentation for credentials, personal data, machine-specific paths, and asset redistribution permissions.
- Keep third-party dependency notices intact. A project license does not replace dependency licenses.

`"private": true` in `package.json` only prevents npm publication; repository visibility is configured separately on your Git host.

## 2. Know what belongs in the first commit

Commit:

- `src/`, `electron/`, `windows/`, and `scripts/` source.
- `index.html`, `vite.config.ts`, `electron-builder.yml`, and `tsconfig*.json`.
- `package.json` **and** `package-lock.json`.
- `README.md`, `CONTRIBUTING.md`, and `docs/`.
- `.gitignore`, `.gitattributes`, `.editorconfig`, and `.nvmrc`.
- Any future application assets whose use and redistribution have been approved.

Do not commit:

- `node_modules/`, `dist/`, `build/`, or `release/`.
- Test reports, coverage output, screenshots under `test-results/`, temporary extraction folders, or logs.
- `.env` files, tokens, signing certificates, or private keys. Deliberately authored `.env.example` files with safe placeholders are allowed, but none is currently needed.
- Local agent state (`__agent__/`, `.omnirush/`) or editor/OS metadata.
- Local reference samples under `assets/external-samples/`; this folder is not used by the app.

These exclusions are in `.gitignore`. Files are kept on disk; ignore rules do not delete them. Ignore rules also do not untrack anything that has already been committed.

## 3. Initialize locally and review

First confirm you are not already inside another Git repository:

```sh
git rev-parse --show-toplevel
```

For this not-yet-initialized folder, a "not a git repository" result is expected. If Git instead prints a repository root, inspect that repository before proceeding rather than creating a nested one accidentally.

Initialize a new repository with a `main` branch:

```sh
git init -b main
git status --short --untracked-files=all
git status --short --ignored
```

Check representative ignored paths:

```sh
git check-ignore -v node_modules/ dist/ build/ release/ __agent__/ assets/external-samples/
```

Then run the project checks documented in the [README](../README.md#checks). Review the file list before staging:

```sh
git add --dry-run .
```

If the proposed file list is correct:

```sh
git add .
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Ensure dependencies, installers, private notes, reference-only files, and secrets are not staged. `.gitignore` cannot recognize every secret and does not replace this review.

If Git requests an author identity, set it **for this repository only**, using your own details:

```sh
git config --local user.name "YOUR_NAME"
git config --local user.email "YOUR_EMAIL"
```

When satisfied, create the first commit:

```sh
git commit -m "Initial Still flip clock project"
git status
```

No global Git settings need to be changed. `.gitattributes` defines line endings for this project.

## 4. Add a remote later

Create an **empty** repository on your chosen host without generating another README, license, or `.gitignore`. Replace `REMOTE_URL` below with the repository's SSH or HTTPS clone URL; do not put a token or password in that URL or in project files.

```sh
git remote add origin REMOTE_URL
git remote -v
git push -u origin main
```

Only push after confirming the intended account, remote URL, and repository visibility. Authenticate using your host's supported credential manager or SSH setup, not committed credentials.

## 5. Keep generated releases separate

Build installers locally using `npm run windows:build`. Distribute approved artifacts through your Git host's release attachments or another chosen release channel, rather than committing `release/` or `build/` into source history. The project does not yet configure CI, automatic releases, or signing credentials.

For ongoing work, follow [CONTRIBUTING.md](../CONTRIBUTING.md).
