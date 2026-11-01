---
paths:
  - "src/services/terminalRegistry.ts"
  - "src/services/webglKeeper.ts"
  - "src/pty-bridge.ts"
  - "src/components/TerminalPane.tsx"
  - "src/dev/mockTauri.ts"
---

# Terminal registry and PTY bridge

`terminalRegistry.ts` owns the xterm.js `Terminal` and the PTY for each pane in a module-level Map keyed
by pane id, outside React. `TerminalPane.tsx` only hosts an entry (attach, fit, theme/font sync, focus)
and renders the header, find bar and exit banner — it must not own the lifecycle.

- `attachTerminal()` is synchronous: it creates the xterm inside the host so it measures correctly, and
  starts the PTY asynchronously. Input typed before the PTY is ready is queued on `entry.ready`.
- On remount the same `rootEl` is re-attached, which is what preserves scrollback.
- `destroyTerminal()` is the only place that disposes a terminal and its PTY.
- Restarting an exited shell uses a new PTY id (`<paneId>_r<n>`), so the old process's exit event cannot
  hit the new terminal.
- The registry also hosts OSC 9;9 / OSC 7 cwd tracking, title/bell hooks, copy/paste key handling,
  copy-on-select (on mouse release) and the text snapshots the overview renders.
- **win32-input-mode** (`services/win32Input.ts`): ConPTY asks for it with `CSI ? 9001 h` as each PTY
  starts; while it is set, keydown/keyup go as `CSI Vk;Sc;Uc;Kd;Cs;Rc _`, as Windows Terminal sends them.
  Through xterm's text ConPTY guessed keys back on a US layout: Ctrl+Space (NUL) reached Windows Emacs
  `-nw` as `C-"` on a JIS keyboard, and Ctrl+/ and Ctrl+. sent nothing. Copy/paste keys are handled
  first; IME composition, dead keys, AltGr and Shift+Insert stay xterm's text. Modifiers alone are not
  sent, and a release only for a key whose press was sent (a shortcut's key sends nothing). Both input
  paths go through one `input()`, which keeps Enter's restart and command-start handling. The mode is
  dropped with the shell state on exit and restart; the new PTY asks again.

## IPC

`pty-bridge.ts` wraps `invoke()` for `create`, `write`, `resize`, `destroy`, `getCwd`. Output streams
over a Tauri `Channel<ArrayBuffer>` passed into `create` (raw bytes — no JSON array encoding); exit is
the event `pty-exit-{id}` with `{ code }`; `create` resolves to the shell actually launched.

**The channel handler must never throw.** A Tauri `Channel` handles messages by index, so one throw
stops it at that index for good: every later chunk queues and the pane goes silent. xterm's `write`
throws past 50 MB of pending data, so `create` catches around `onData`. The dev mock delivers through
the same indexed path (`runCallback`).

## Renderer recovery

WebGL goes through `webglKeeper.ts`. A lost context (a crashed video driver takes the GPU process with
it) is never waited for — xterm's own restore left panes behind a tab or zoomed away blank. Instead the
addon is disposed at once, the DOM renderer refits and redraws, and a fresh addon is tried 2 s later
while the pane is visible (`resumeRenderer`, called on every fit and re-attach). After 3 losses the pane
stays on the DOM renderer.

## Text rendering

xterm is configured with `allowTransparency: false` and an integer `letterSpacing` to avoid blurry
glyphs on the transparent window. Don't revert these for visual tweaks.

Command tracking: shell integration emits OSC 133 A/B/D (pwsh also the exit code). The registry anchors
the prompt end with an xterm marker and reads the command text lazily — the echo is not in the buffer
yet when Enter is pressed. `PaneStateStore.onCommandFinished` feeds `hooks/useCommandNotifications.ts`
(toast vs. OS notification via `tauri-plugin-notification` + `requestUserAttention`).
