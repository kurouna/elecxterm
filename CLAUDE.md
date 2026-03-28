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

There is no lint or test runner configured. TypeScript strict mode is enforced via `tsconfig.json`.

## Architecture

### Frontend (`src/`)

**Data Model** (`src/types.ts`):
- Layout is a binary tree: `LayoutNode` is either a `PaneNode` (leaf) or `SplitNode` (branch with `horizontal/vertical` direction and ratio array).
- A `Tab` holds a `LayoutNode` tree + active pane ID + initial cwd.
- A `Session` holds multiple `Tab`s.

**State Management** (`src/hooks/useLayout.ts`):
- Single hook owns all tabs, active tab, and global settings.
- Persists to `elecxterm-settings.json` via Tauri plugin store (500ms debounce on change).
- Hard limit of **15 panes** across all tabs.

**IPC Bridge** (`src/pty-bridge.ts`):
- Thin TypeScript wrapper over Tauri `invoke()` calls for PTY operations: `create`, `write`, `resize`, `destroy`, `getCwd`.
- Subscribes to Tauri events `pty-data-{id}` and `pty-exit-{id}` for streaming output.

**Components**:
- `TerminalPane.tsx` — xterm.js instance lifecycle (create PTY on mount, attach data listeners, handle resize, cleanup on unmount). Uses WebGL renderer.
- `SplitLayout.tsx` — Recursively renders `LayoutNode` tree. Handles drag-resize handles that update ratios. Uses Framer Motion for animations.
- `CommandPalette.tsx` — Opened with `Ctrl+Shift+K`.

**Theme System** (`src/ThemeContext.tsx`):
- Supports `dark / light / system`. Stored in `localStorage["elecxterm-theme"]`.
- Applies `data-theme` attribute to `<html>`. CSS variables defined in `src/index.css` using Tailwind v4 `@theme`.

### Backend (`src-tauri/src/`)

**PTY Manager** (`pty_manager.rs`):
- `PtyManager` uses a `DashMap<String, Arc<PtyInstance>>` for lock-free concurrent access.
- `create_pty()` spawns the shell via `portable-pty`, then launches two Tokio async tasks:
  1. **Read loop**: reads PTY output → emits `pty-data-{id}` Tauri event.
  2. **Child monitor**: awaits process exit → emits `pty-exit-{id}`.
- Writes use `parking_lot::Mutex` on the writer; resize uses `AtomicU16` for rows/cols.
- `destroy_pty()` removes from DashMap; Arc drop handles deallocation.

**Commands** (`commands.rs`): Tauri IPC endpoints that delegate to `PtyManager`. Errors are converted to strings for IPC serialization.

## Key Constraints

- **Windows primary target**: Shell defaults to CMD/PowerShell. PTY creation must handle Windows-specific paths.
- **No decorations window**: The app window is transparent and frameless (`tauri.conf.json`). `TitleBar.tsx` provides custom window chrome.
- **CSP is disabled** (`"security": { "csp": null }`) — avoid adding external script sources.
- **Tauri v2 API**: Use `@tauri-apps/api/core` for `invoke()`, `@tauri-apps/api/event` for `listen()`. Tauri v1 APIs are incompatible.
- **Tailwind v4**: Uses `@theme` directive and CSS variables rather than `tailwind.config.js`. Class names follow v4 conventions.
