---
paths:
  - "src/styles/crt.css"
  - "src/services/crt.ts"
  - "src/themeTransition.ts"
  - "src/components/ui.tsx"
---

# CRT motion system

`src/styles/crt.css` (ported from elecdex) is imported into `layer(components)` — unlayered, its
`position: relative` would override `fixed`/`absolute` utilities. It defines `crt-on` (power on from a
bright line, beam + scanlines), `crt-off`/`crt-beam` (collapse to a line, then a dot), `crt-flash` (tab
switch), `crt-select` (chosen overview card) and `chrome-boot`. `src/services/crt.ts` applies them
imperatively (`powerOn` / `powerOff` / `flash`); framer-motion exits use `CRT_EXIT` from `ui.tsx`.

- New terminals power on, staggered when restored together (`createdAt` / `powerOnDelay` in the
  registry). Closing a visible pane or tab plays `powerOff` before removal (`closePaneAnimated` /
  `closeTabAnimated` in `App.tsx`).
- **Animate only transform, opacity and filter — never size**, which would send transient sizes to
  ConPTY. Zoom uses a FLIP flight (`flyFrom`) instead of resizing.
- Everything is skipped under `prefers-reduced-motion`.
- Apply an effect only to an element the size of the thing that appears: `Overlay` takes a required
  `width` so the effect box is the panel, not the whole window.
- Don't put `crt-on` on an element positioned with a `translate` — the animation's transform replaces
  it. Wrap the element instead.
- The tab-switch flash is suppressed when another effect (overview select) is already playing.
- A tab's top line is its own element (`LINE_ON` / `LINE_OFF`): it shrinks to a dot when the tab stops
  being active or starts closing (`App` passes `closingTabIds` so the line goes out at once while the
  content powers off) and grows from the centre on the newly active tab. `AnimatePresence propagate`
  makes it play when the whole chip is removed.

Theme flips live in `themeTransition.ts`: a View Transitions "CRT flip" (the old snapshot collapses to a
beam on black, the new one opens from it) plus `flushSync`.
