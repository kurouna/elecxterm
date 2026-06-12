# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

elecxterm is a next-generation terminal manager built with **Tauri v2** (Rust backend) + **React 19 / TypeScript** (frontend). It supports multi-tab layouts with recursive tiling (binary tree), xterm.js-based terminal rendering, and session persistence.

## Development Commands

```bash
npm run dev          # Start Vite dev server only (port 1420)
npm run tauri dev    # Full dev build with Tauri (use this for testing)
npm run build        # TypeScript type-check + Vite bundle
npm run tauri build  # Produce release installer (.msi / .exe)
```

On this machine, `cargo` may fail to find the MSVC toolchain. Use the wrapper scripts that set `PATH`/`INCLUDE`/`LIB` for VS 2026 + Windows SDK before building:

```powershell
./dev.ps1        # env setup + npm run tauri dev
./build_fix.ps1  # env setup + cargo build (in src-tauri)
```

There is no lint or test runner configured. TypeScript strict mode is enforced via `tsconfig.json`.

## Architecture

### Frontend (`src/`)

**Data Model** (`src/types.ts`):
- Layout is a binary tree: `LayoutNode` is either a `PaneNode` (leaf) or `SplitNode` (branch with `horizontal/vertical` direction and ratio array).
- A `Tab` holds a `LayoutNode` tree + active pane ID + initial cwd.
- A `Session` holds multiple `Tab`s.

**Two-tier state management** — persistent layout state lives in React; terminal instances and volatile per-pane state live outside React. This split is deliberate: layout changes remount components, and terminals must survive that.

1. **`src/hooks/useLayout.ts`** — single hook owning all tabs, active tab, and global settings. Persists to `elecxterm-settings.json` via Tauri plugin store (500ms debounce). Hard limit of **15 panes** across all tabs.
2. **`src/services/terminalRegistry.ts`** — owns xterm.js `Terminal` + PTY lifecycle in a module-level Map keyed by pane ID. Each entry has a stable `rootEl` div; when split/close rebuilds the layout and `TerminalPane` remounts, it re-attaches the same `rootEl` instead of recreating the terminal, preserving scrollback and cwd. `destroyTerminal()` is the only place that disposes a terminal and its PTY.
3. **`src/services/PaneStateStore.ts`** — volatile pane state (run status) in a pub/sub store outside React, so frequent status updates don't re-render the whole tabs tree. Consumed via `src/hooks/usePaneState.ts` (per-pane and all-statuses subscriptions).

**IPC Bridge** (`src/pty-bridge.ts`):
- Thin TypeScript wrapper over Tauri `invoke()` calls for PTY operations: `create`, `write`, `resize`, `destroy`, `getCwd`.
- PTY output streams over a Tauri `Channel<ArrayBuffer>` passed into `create` (raw-bytes fast path, no JSON array encoding). Process exit is still a Tauri event `pty-exit-{id}`.

**Components**:
- `TerminalPane.tsx` — thin host for a registry terminal entry: appends `rootEl`, handles fit/resize and theme/font updates. Does NOT own the terminal lifecycle (see terminalRegistry above).
- `SplitLayout.tsx` — recursively renders the `LayoutNode` tree. Handles drag-resize handles that update ratios. Uses Framer Motion for animations.
- `CommandPalette.tsx` — opened with `Ctrl+Shift+K`.
- `src/hooks/useKeybinds.ts` — global keyboard shortcuts (Ctrl+Shift+… for tabs/panes/splits, font size) on a single window listener; also `preventDefault`s browser shortcuts (Ctrl+R/P/F/…, F5) that would interfere with terminal use.

**Theme System** (`src/ThemeContext.tsx`):
- Supports `dark / light / system`. Stored in `localStorage["elecxterm-theme"]`.
- Applies `data-theme` attribute to `<html>`. CSS variables defined in `src/index.css` using Tailwind v4 `@theme`.
- xterm colors are separate objects in `TerminalPane.tsx` (`DARK_THEME` / `LIGHT_THEME`) and must be kept in sync with the CSS variables manually.

### Backend (`src-tauri/src/`)

**PTY Manager** (`pty_manager.rs`):
- `PtyManager` uses a `DashMap<String, Arc<PtyInstance>>` for lock-free concurrent access.
- `create_pty()` spawns the shell via `portable-pty`, then launches two Tokio async tasks:
  1. **Read loop**: reads PTY output → sends raw bytes via the `Channel<InvokeResponseBody>` (`Raw`) passed to `create_pty`.
  2. **Child monitor**: awaits process exit → emits `pty-exit-{id}`.
- Writes use `parking_lot::Mutex` on the writer; resize uses `AtomicU16` for rows/cols.
- `destroy_pty()` removes from DashMap; Arc drop handles deallocation.

**Commands** (`commands.rs`): Tauri IPC endpoints that delegate to `PtyManager`. Errors are converted to strings for IPC serialization.

## Key Constraints

- **Windows primary target**: Shell defaults to CMD/PowerShell (PowerShell panes use `pwsh`, PowerShell 7). PTY creation must handle Windows-specific paths.
- **No decorations window**: The app window is transparent and frameless (`tauri.conf.json`). `TitleBar.tsx` provides custom window chrome.
- **CSP is disabled** (`"security": { "csp": null }`) — avoid adding external script sources.
- **Tauri v2 API**: Use `@tauri-apps/api/core` for `invoke()`, `@tauri-apps/api/event` for `listen()`. Tauri v1 APIs are incompatible.
- **Tailwind v4**: Uses `@theme` directive and CSS variables rather than `tailwind.config.js`. Class names follow v4 conventions. Keep bare `*` resets inside `@layer base`, or they override padding/margin utilities.
- **Text rendering**: xterm is configured with `allowTransparency: false` and integer `letterSpacing` in `terminalRegistry.ts` to avoid blurry glyphs on the transparent window — don't revert these for visual tweaks.
