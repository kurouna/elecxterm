---
paths:
  - "src/types.ts"
  - "src/hooks/useLayout.ts"
  - "src/hooks/usePaneState.ts"
  - "src/services/PaneStateStore.ts"
  - "src/services/paneInfo.ts"
  - "src/components/SplitLayout.tsx"
  - "src/components/TabContent.tsx"
  - "src/App.tsx"
---

# Layout tree and state ownership

## Data model (`types.ts`)

- The layout is a binary tree: a `LayoutNode` is either a `PaneNode` (leaf) or a `SplitNode` (branch with
  a `horizontal`/`vertical` direction and a ratio array).
- A `Tab` holds a `LayoutNode` tree, the active pane id and a start cwd, plus `renamed` (false = the
  title follows the active pane) and `zoomed` (not restored on load).
- `services/paneInfo.ts` has the pure helpers for walking the tree and deriving display titles and
  paths — reuse them instead of re-implementing traversal.

## `useLayout.ts`

Single hook owning all tabs, the active tab and global settings. Pane operations work on any tab: they
look up the tab containing the pane. Terminal prefs live in `Preferences` in `types.ts` and are
persisted here.

Persistence goes to `elecxterm-settings.json` via the Tauri store plugin: 500 ms debounce, re-saved on a
shell `cd`, flushed in `onCloseRequested` (which needs `core:window:allow-destroy`). The saved pane
`cwd` is the live tracked cwd.

`MAX_PANES` is a hard limit of **15 panes across all tabs** — it also keeps WebGL contexts under
Chromium's limit of 16.

## `PaneStateStore.ts`

Volatile pane state (status, title, cwd, launched shell, exit code, unseen-output `activity`, `bell`)
plus the focused pane and MRU order, in a pub/sub store outside React. Consume it through
`hooks/usePaneState.ts`.

## Rendering

`SplitLayout.tsx` renders the tree recursively with drag/keyboard resize handles; `TabContent.tsx`
renders only the active pane while the tab is zoomed. Pane actions and settings reach panes through the
contexts in `components/PaneContext.tsx`, not as props threaded through the recursive layout.
