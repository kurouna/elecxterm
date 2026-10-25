---
paths:
  - "src/components/TitleBar.tsx"
  - "src/components/TabBar.tsx"
  - "src/components/PaneOverview.tsx"
  - "src/components/CommandPalette.tsx"
  - "src/components/SettingsPanel.tsx"
  - "src/components/ShortcutHelp.tsx"
  - "src/components/Prompt.tsx"
  - "src/components/NotificationOverlay.tsx"
  - "src/components/ui.tsx"
  - "src/theme.ts"
  - "src/ThemeContext.tsx"
  - "src/tabColors.ts"
  - "src/index.css"
  - "src/hooks/useWindowMaterial.ts"
---

# Window chrome, overlays and theming

## Title bar and tabs

Tabs live in the title bar. Dragging works through both `-webkit-app-region` and
`data-tauri-drag-region`; don't add an `onDoubleClick` maximize — the OS/Tauri already does it.
Window-drag space is a fixed `w-16` spacer that must survive any tab count. Tabs are `w-[200px]` and
shrink to 84px before the strip scrolls; they use `@container`, so keep an explicit width (containment
zeroes their intrinsic size). With a single tab, dragging the tab moves the window via `startDragging()`
after a 4 px move, so click and double-click still select and rename.

`crt-on` is dropped from a tab once its power-on animation has played (`poweredTabs` in `TabBar.tsx`):
reordering tabs makes React re-insert the DOM nodes, which would replay the animation, and
framer-motion would then measure the squashed tab as its layout and leave it shifted vertically.

Tab colors: `Tab.color` + `src/tabColors.ts` (`tabAccent`), shared by the tab bar and the overview.

## Overlays

`PaneOverview.tsx` shows all panes across tabs as live cards (`Ctrl+Shift+O`) and hosts the
hold-to-switch MRU mode (`Ctrl+Tab`, commit on Ctrl release; `services/modifiers.ts` tracks Ctrl so
quick taps work). `CommandPalette.tsx` is fuzzy search plus recents, with "Go to" pane/tab items only
while searching. `Prompt.tsx` is rename only. All overlays share `Overlay` from `ui.tsx`.

A pane never auto-focuses while an overlay is open — keystrokes would leak into the shell.

## Theming

`ThemeContext.tsx` supports `dark / light / system`, stored in `localStorage["elecxterm-theme"]`, applied
as `data-theme` on `<html>`; CSS variables are defined in `src/index.css` with Tailwind v4 `@theme`.
`theme.ts` builds the xterm theme from those variables (background, foreground `--term-fg`, cursor,
selection, scrollbar) so UI and terminal stay in sync — only the ANSI 16 colors are defined in
`theme.ts`. Terminal color presets are `TERMINAL_SCHEMES` / `applyScheme`; the pane body background
follows the scheme background.

Theme switches go through `runThemeTransition` (`src/themeTransition.ts`). Terminal appearance is applied
in a layout effect so the new View Transition snapshot already has the new colors — keep it that way.

`useWindowMaterial.ts` applies Mica / Mica Alt (Windows 11 only, detected via UA-CH) and sets
`<html data-material>` so CSS makes only the chrome and gaps translucent. The window theme is synced
with `setTheme` (null when the app theme is "system").
