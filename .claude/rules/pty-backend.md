---
paths:
  - "src-tauri/src/**/*.rs"
  - "src-tauri/Cargo.toml"
  - "src-tauri/tauri.conf.json"
  - "src-tauri/capabilities/*.json"
---

# Rust backend

`PtyManager` (`pty_manager.rs`) keeps a `DashMap<String, Arc<PtyInstance>>` for lock-free concurrent
access.

`create_pty()` spawns the shell via `portable-pty` (cwd falls back to the home dir; `pwsh` falls back to
`powershell.exe`), injects shell integration, then starts two dedicated threads:

1. **Reader** — blocking reads, raw bytes out over the `Channel<InvokeResponseBody>` (`Raw`).
2. **Waiter** — owns the child and blocks in `wait()`, then emits `pty-exit-{id}` with the exit code.

Kill goes through a cloned `ChildKiller`, so there is no polling and no lock contention. Writes take a
`parking_lot::Mutex` on the writer. A duplicate id (frontend reload) destroys the stale PTY and recreates
it. `destroy_pty()` removes the entry from the DashMap, kills, and drops the instance on a blocking
thread, because `ClosePseudoConsole` can block.

Shell integration: cmd gets a `PROMPT` env prefixed with OSC 9;9; pwsh gets an `-EncodedCommand`
wrapping `prompt`. `ELECXTERM_NO_SHELL_INTEGRATION` disables it.

`commands.rs` holds the Tauri IPC endpoints; they delegate to `PtyManager` and convert errors to strings
for IPC serialization.
