# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

elecxterm is a next-generation terminal manager built with **Tauri v2** (Rust backend) + **React 19 / TypeScript** (frontend). It supports multi-tab layouts with recursive tiling (binary tree), xterm.js-based terminal rendering, and session persistence.

## Development Commands

```bash
npm run dev          # Vite dev server only (port 1420). Opened in a plain browser, Tauri IPC is mocked
                     # with a fake shell (src/dev/mockTauri.ts, dev-only) so the UI can be exercised.
                     # ?demo=<main|overview|switch|palette|settings>&theme=<dark|light> replays the
                     # README screenshot scenes (src/dev/demo.ts); ./scripts/capture-screenshots.ps1
                     # re-shoots them into docs/screenshots/ with headless Edge (dev server must be running).
npm run tauri dev    # Full dev build with Tauri (use this for testing)
npm run build        # TypeScript type-check + Vite bundle
npm run tauri build  # Produce release installer (.msi / .exe)
```

Rust (rustup, stable-msvc) and VS 2022 Build Tools are installed on this machine; `cargo` lives in `%USERPROFILE%\.cargo\bin` (open a new shell if it isn't on PATH). `src-tauri/icons` is gitignored — run `npx tauri icon ./app-icon.svg` once before the first Rust build. The wrapper scripts below target a VS 2026 install from another machine and Use the wrapper scripts that set `PATH`/`INCLUDE`/`LIB` for VS 2026 + Windows SDK before building:

```powershell
./dev.ps1        # env setup + npm run tauri dev
./build_fix.ps1  # env setup + cargo build (in src-tauri)
```

There is no lint or JS test runner configured. TypeScript strict mode is enforced via `tsconfig.json`. `cargo test` (in src-tauri) runs Rust unit tests; `cargo test -- --ignored` spawns real cmd / PowerShell through ConPTY to check the shell-integration sequences.

## Architecture

### Frontend (`src/`)

**Data Model** (`src/types.ts`):
- Layout is a binary tree: `LayoutNode` is either a `PaneNode` (leaf) or `SplitNode` (branch with `horizontal/vertical` direction and ratio array).
- A `Tab` holds a `LayoutNode` tree + active pane ID + start cwd, plus `renamed` (false = title follows the active pane) and `zoomed` (not restored on load).
- `src/services/paneInfo.ts` holds the pure helpers for walking the tree and deriving display titles/paths — reuse them instead of re-implementing traversal.

**Two-tier state management** — persistent layout state lives in React; terminal instances and volatile per-pane state live outside React. This split is deliberate: layout changes remount components, and terminals must survive that.

1. **`src/hooks/useLayout.ts`** — single hook owning all tabs, active tab, and global settings. Pane operations work on any tab (they look up the tab containing the pane). Persists to `elecxterm-settings.json` via Tauri plugin store (500ms debounce, also re-saved on shell `cd`, flushed in `onCloseRequested` — needs `core:window:allow-destroy`). Saved pane `cwd` is the live tracked cwd. Hard limit of **15 panes** across all tabs (also keeps WebGL contexts under Chromium's 16 limit).
2. **`src/services/terminalRegistry.ts`** — owns xterm.js `Terminal` + PTY lifecycle in a module-level Map keyed by pane ID. `attachTerminal()` is synchronous: it creates the xterm inside the host (so it measures correctly) and starts the PTY asynchronously; input typed before the PTY is ready is queued on `entry.ready`. On remount the same `rootEl` is re-attached, preserving scrollback. `destroyTerminal()` is the only place that disposes a terminal and its PTY. Restarting an exited shell uses a new PTY id (`<paneId>_r<n>`) so the old process's exit event can't hit the new one. Also hosts OSC 9;9 / OSC 7 cwd tracking, title/bell hooks, copy/paste key handling, copy-on-select (on mouse release) and text snapshots for the overview.
3. **`src/services/PaneStateStore.ts`** — volatile pane state (status, title, cwd, launched shell, exit code, unseen-output `activity`, `bell`) plus the focused pane and MRU order, in a pub/sub store outside React. Consumed via `src/hooks/usePaneState.ts`.

**IPC Bridge** (`src/pty-bridge.ts`):
- Thin TypeScript wrapper over Tauri `invoke()` calls for PTY operations: `create`, `write`, `resize`, `destroy`, `getCwd`.
- PTY output streams over a Tauri `Channel<ArrayBuffer>` passed into `create` (raw-bytes fast path, no JSON array encoding). Process exit is a Tauri event `pty-exit-{id}` with `{ code }`. `create` resolves to the shell actually launched.

**Components**:
- `TerminalPane.tsx` — host for a registry terminal entry (attach, fit, theme/font sync, focus) plus the pane header, find bar and exit banner. Does NOT own the terminal lifecycle. It never auto-focuses while an overlay is open (keystrokes would leak into the shell). Pane actions/settings arrive via `PaneContext.tsx` contexts rather than props through the recursive layout.
- `SplitLayout.tsx` — recursively renders the `LayoutNode` tree with drag/keyboard resize handles. `TabContent.tsx` renders only the active pane when the tab is zoomed.
- `TitleBar.tsx` + `TabBar.tsx` — tabs live in the title bar (drag via both `-webkit-app-region` and `data-tauri-drag-region`; don't add an `onDoubleClick` maximize — the OS/Tauri already does it).
- `PaneOverview.tsx` — all panes across tabs as live cards (`Ctrl+Shift+O`), and the hold-to-switch MRU mode (`Ctrl+Tab`, commit on Ctrl release; `services/modifiers.ts` tracks Ctrl so quick taps work).
- `CommandPalette.tsx` (`Ctrl+Shift+K`, fuzzy search, recents, "Go to" pane/tab items only while searching), `SettingsPanel.tsx` (`Ctrl+Shift+.` — the same physical key as the old last-pane `Ctrl+Shift+>`, which moved to `Ctrl+Shift+End` at the user's request; terminal prefs live in `Preferences` in `types.ts`, persisted by useLayout), `ShortcutHelp.tsx`, `Prompt.tsx` (only rename now), `NotificationOverlay.tsx` (toast stack). Overlays share `Overlay` from `ui.tsx`.
- Command tracking: shell integration emits OSC 133 A/B/D (pwsh also the exit code). `terminalRegistry` anchors the prompt end with an xterm marker and reads the command text lazily (the echo isn't in the buffer yet when Enter is pressed). `PaneStateStore.onCommandFinished` feeds `hooks/useCommandNotifications.ts` (toast vs. OS notification via `tauri-plugin-notification` + `requestUserAttention`).
- Terminal color presets live in `src/theme.ts` (`TERMINAL_SCHEMES`, `applyScheme`); the pane body background follows the scheme background.
- `hooks/useWindowMaterial.ts` applies Mica / Mica Alt (Windows 11 only, detected via UA-CH) and sets `<html data-material>` so CSS makes only the chrome/gaps translucent. Window theme is synced with `setTheme` (null when the app theme is "system").
- Theme switches go through `runThemeTransition` (`src/themeTransition.ts`: View Transitions circular reveal + `flushSync`). Terminal appearance is applied in a layout effect so the new snapshot already has the new colors — keep it that way.
- Tab colors: `Tab.color` + `src/tabColors.ts` (`tabAccent`) shared by the tab bar and the overview.
- `src/hooks/useKeybinds.ts` — table-driven global shortcuts on a single window capture listener; also `preventDefault`s browser shortcuts (Ctrl+R/P/F/…, F5). While an overlay is open, only `global` bindings fire so the overlay gets the keys. Display strings live in `src/keymap.ts`; keep both in sync. Existing bindings are a user requirement — don't change them without asking (the only approved change so far: last pane `Ctrl+Shift+>` → `Ctrl+Shift+End`, freeing it for settings).

**Theme System** (`src/ThemeContext.tsx`):
- Supports `dark / light / system`. Stored in `localStorage["elecxterm-theme"]`.
- Applies `data-theme` attribute to `<html>`. CSS variables defined in `src/index.css` using Tailwind v4 `@theme`.
- The xterm theme is built by `src/theme.ts` from those CSS variables (background, foreground `--term-fg`, cursor, selection, scrollbar), so UI and terminal colors stay in sync automatically; only the ANSI 16 colors are defined in `theme.ts`.

### Backend (`src-tauri/src/`)

**PTY Manager** (`pty_manager.rs`):
- `PtyManager` uses a `DashMap<String, Arc<PtyInstance>>` for lock-free concurrent access.
- `create_pty()` spawns the shell via `portable-pty` (cwd falls back to the home dir; `pwsh` falls back to `powershell.exe`), injects shell integration (cmd: `PROMPT` env prefixed with OSC 9;9; pwsh: `-EncodedCommand` wrapping `prompt`; disable with `ELECXTERM_NO_SHELL_INTEGRATION`), then starts two dedicated threads:
  1. **Reader**: blocking reads → raw bytes via the `Channel<InvokeResponseBody>` (`Raw`).
  2. **Waiter**: owns the child and blocks in `wait()` → emits `pty-exit-{id}` with the exit code. Kill goes through a cloned `ChildKiller`, so there is no polling or lock contention.
- Writes use `parking_lot::Mutex` on the writer. A duplicate id (frontend reload) destroys the stale PTY and recreates it.
- `destroy_pty()` removes from DashMap, kills, and drops the instance on a blocking thread (ClosePseudoConsole can block).

**Commands** (`commands.rs`): Tauri IPC endpoints that delegate to `PtyManager`. Errors are converted to strings for IPC serialization.

## Key Constraints

- **Windows primary target**: Shell defaults to CMD/PowerShell (PowerShell panes use `pwsh`, PowerShell 7). PTY creation must handle Windows-specific paths.
- **No decorations window**: The app window is transparent and frameless (`tauri.conf.json`). `TitleBar.tsx` provides custom window chrome.
- **Assets**: everything in `public/` is bundled into the app — keep README screenshots in `docs/screenshots/`. PowerShell scripts with Japanese text must be saved as UTF-8 *with BOM* (Windows PowerShell 5.1 otherwise reads them as Shift-JIS).
- **CSP is disabled** (`"security": { "csp": null }`) — avoid adding external script sources. UI fonts are system fonts (no Google Fonts) so the app works offline.
- **Tauri v2 API**: Use `@tauri-apps/api/core` for `invoke()`, `@tauri-apps/api/event` for `listen()`. Tauri v1 APIs are incompatible.
- **Keep Tauri versions in lockstep**: `tauri build` (and therefore the release CI) fails if an npm `@tauri-apps/*` package and its Rust crate differ in major.minor (e.g. `@tauri-apps/api` 2.12 vs `tauri` 2.11). `cargo test`/`cargo build` do not check this — after touching either lockfile, run `npm run tauri build` (or `npx tauri info`) before tagging.
- **Tailwind v4**: Uses `@theme` directive and CSS variables rather than `tailwind.config.js`. Class names follow v4 conventions. Keep bare `*` resets inside `@layer base`, or they override padding/margin utilities.
- **Text rendering**: xterm is configured with `allowTransparency: false` and integer `letterSpacing` in `terminalRegistry.ts` to avoid blurry glyphs on the transparent window — don't revert these for visual tweaks.
