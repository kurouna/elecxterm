# CLAUDE.md

elecxterm is a terminal manager for Windows: **Tauri v2** (Rust) + **React 19 / TypeScript / Tailwind v4**.
Multi-tab layouts with recursive tiling (binary tree), xterm.js rendering, session persistence.

This file holds only what every session needs; topic details live in `.claude/rules/` and load when you
open the matching files.

## Commands

```bash
npm run dev          # Vite only, port 1420. In a plain browser Tauri IPC is mocked with a fake shell
                     # (src/dev/mockTauri.ts, dev-only), so the UI can be exercised without Rust.
npm run tauri dev    # full dev build — use this to test real terminal behaviour
npm run build        # TypeScript type-check + Vite bundle
npm run tauri build  # release installer (.msi / .exe)
npm run test:e2e     # Playwright suite in e2e/ against the dev server + IPC mock (Edge)
cargo test           # Rust unit tests (run in src-tauri/)
```

This machine has rustup (stable-msvc) and VS 2022 Build Tools; `cargo` lives in
`%USERPROFILE%\.cargo\bin` — open a new shell if it isn't on PATH. `./dev.ps1` and `./build_fix.ps1` wrap
`tauri dev` / `cargo build` with `PATH`/`INCLUDE`/`LIB` set for a VS 2026 install from another machine,
so use them only if the plain commands can't find the toolchain. `src-tauri/icons` is gitignored: run
`npx tauri icon ./app-icon.svg` once before the first Rust build.

No linter is configured; TypeScript strict mode is the only static check.

## Where things live

| Path | Responsibility |
| - | - |
| `src/types.ts` | `LayoutNode` binary tree (`PaneNode` \| `SplitNode`), `Tab`, `Preferences` |
| `src/hooks/useLayout.ts` | all tabs / active tab / settings, persistence (single owner) |
| `src/services/terminalRegistry.ts` | xterm + PTY lifecycle outside React, keyed by pane id |
| `src/services/PaneStateStore.ts` | volatile pane state (status, cwd, activity), focus, MRU |
| `src/services/paneInfo.ts` | pure tree-walking and title/path helpers — reuse, don't re-implement |
| `src/pty-bridge.ts` | thin wrapper over the Tauri `invoke()` PTY commands |
| `src/components/` | `TerminalPane` (host only), `SplitLayout`, `TitleBar`/`TabBar`, overlays |
| `src/hooks/useKeybinds.ts` + `src/keymap.ts` | global shortcuts and their display strings |
| `src/theme.ts`, `src/ThemeContext.tsx`, `src/index.css` | theme vars, xterm theme, color schemes |
| `src/styles/crt.css` + `src/services/crt.ts` | CRT motion effects |
| `src-tauri/src/pty_manager.rs` | `PtyManager`: spawn, reader/waiter threads, shell integration |
| `src-tauri/src/commands.rs` | Tauri IPC endpoints delegating to `PtyManager` |
| `e2e/`, `scripts/capture-screenshots.ps1` | Playwright specs; README screenshot capture |

## Project-wide rules

- **Two-tier state is deliberate**: persistent layout in React, terminal instances and volatile pane
  state outside it. Layout changes remount components, and terminals must survive that.
- **Existing keybindings are a user requirement.** Ask before changing or adding one; the user is on a
  JIS keyboard, so judge shortcuts by physical key.
- **Windows first**: shells are CMD and `pwsh` (PowerShell 7). PTY code must handle Windows paths.
- Hard limit of **15 panes across all tabs** (`MAX_PANES` in `useLayout.ts`) — it keeps WebGL contexts
  under Chromium's limit of 16.
- **Frameless transparent window** (`tauri.conf.json`, no decorations): `TitleBar.tsx` is the chrome.
- **Tauri v2 API only** — `@tauri-apps/api/core` for `invoke()`, `/event` for `listen()`; v1 APIs break.
- **Keep Tauri versions in lockstep**: `tauri build` fails if an npm `@tauri-apps/*` package and its Rust
  crate differ in major.minor. `cargo test`/`cargo build` don't check this, so after touching either
  lockfile run `npm run tauri build` (or `npx tauri info`) before tagging.
- **CSP is disabled** (`"security": { "csp": null }`): add no external script sources, and keep UI fonts
  to system fonts so the app works offline.
- **Assets**: everything in `public/` ships inside the app — README screenshots belong in
  `docs/screenshots/`.
- PowerShell scripts containing Japanese must be saved as **UTF-8 with BOM** (PowerShell 5.1 otherwise
  reads them as Shift-JIS).
- Tailwind v4: `@theme` + CSS variables, no `tailwind.config.js`. Keep bare `*` resets inside
  `@layer base`, or they override padding/margin utilities.

## Topic rules

`.claude/rules/` — `terminal-registry.md` (xterm/PTY/WebGL/IPC), `layout-state.md` (tree, persistence,
pane budget), `ui-chrome.md` (title bar, tabs, overlays, theming), `motion-crt.md` (CRT effects),
`keybindings.md`, `pty-backend.md` (Rust side), `testing.md` (e2e + cargo test).
