---
paths:
  - "src/hooks/useKeybinds.ts"
  - "src/keymap.ts"
---

# Keybindings

**The existing bindings are a user requirement — don't change or add one without asking.** The only
approved change so far: last pane moved from `Ctrl+Shift+>` to `Ctrl+Shift+End`, freeing that physical
key for settings (`Ctrl+Shift+.`). The user types on a JIS keyboard, so judge a shortcut by its physical
key and use `e.code` where a binding must be layout-independent.

`useKeybinds.ts` is table-driven on a single window capture listener. It also `preventDefault`s browser
shortcuts (Ctrl+R/P/F/…, F5). While an overlay is open only `global` bindings fire, so the overlay gets
the keys.

Display strings live in `src/keymap.ts`; keep the table and the strings in sync.
