---
paths:
  - "e2e/**"
  - "playwright.config.ts"
  - "src/dev/**"
  - "scripts/capture-screenshots.ps1"
---

# Tests and dev harness

`npm run test:e2e` runs the Playwright suite in `e2e/` against the dev server with the IPC mock, using
the installed Edge (`channel: "msedge"`). Run it after touching tab, pane or keybinding code.

- `window.__ELECXTERM_MOCK__` exposes live PTY ids and an IPC log;
  `window.__ELECXTERM_REGISTRY__` (dev only) exposes terminal snapshots.
- Don't dynamic-import app modules from a test: after HMR that yields a second module instance.
- `expectNoLeakedShells` asserts that live PTYs match the panes on screen.
- `e2e/terminal-recovery.spec.ts` crashes Edge's GPU process (CDP `Browser.crashGpuProcess`, with a fresh
  Edge per test since a few crashes turn the GPU off) and reads what the pane draws from a screenshot
  (`e2e/png.ts`). The mock's `flood N` sends N MB at once.

`cargo test` (in `src-tauri/`) runs the Rust unit tests; `cargo test -- --ignored` spawns real cmd and
PowerShell through ConPTY to check the shell-integration sequences.

Demo scenes: `?demo=<main|overview|switch|palette|settings>&theme=<dark|light>` replays the README
screenshot scenes (`src/dev/demo.ts`), and `./scripts/capture-screenshots.ps1` re-shoots them into
`docs/screenshots/` with headless Edge (the dev server must be running).
