import { Terminal, ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ptyBridge } from "../pty-bridge";
import { paneStateStore } from "./PaneStateStore";

/**
 * Terminal/PTY インスタンスの寿命を React ツリーから切り離して管理する。
 * ペイン分割・クローズ時のレイアウト再構築で TerminalPane が再マウントされても
 * 同じ xterm / PTY を別のホスト要素に付け替えるだけで、カレントディレクトリや
 * スクロールバックを失わないようにする。
 */

export interface TerminalCreateOptions {
  paneId: string;
  cwd?: string;
  shell?: string;
  fontFamily: string;
  fontSize: number;
  theme: ITheme;
}

export interface TerminalEntry {
  paneId: string;
  /** xterm を open() する安定したホスト要素。TerminalPane が自分の container に appendChild する */
  rootEl: HTMLDivElement;
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
}

const entries = new Map<string, TerminalEntry>();
const cleanups = new Map<string, () => void>();
const pending = new Map<string, Promise<TerminalEntry>>();

export async function getOrCreateTerminal(
  options: TerminalCreateOptions
): Promise<TerminalEntry> {
  const existing = entries.get(options.paneId);
  if (existing) return existing;

  const inProgress = pending.get(options.paneId);
  if (inProgress) return inProgress;

  const promise = createEntry(options);
  pending.set(options.paneId, promise);
  try {
    return await promise;
  } finally {
    pending.delete(options.paneId);
  }
}

async function createEntry(options: TerminalCreateOptions): Promise<TerminalEntry> {
  const rootEl = document.createElement("div");
  rootEl.style.height = "100%";
  rootEl.style.width = "100%";
  rootEl.style.background = "transparent";

  const terminal = new Terminal({
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineHeight: 1.2,
    fontWeight: "500",
    fontWeightBold: "bold",
    cursorBlink: true,
    cursorStyle: "bar",
    cursorWidth: 2,
    allowTransparency: true,
    scrollback: 5000,
    theme: options.theme,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(
    new WebLinksAddon((_event, uri) => {
      openUrl(uri).catch(() => {});
    })
  );
  terminal.open(rootEl);

  let webglAddon: WebglAddon | null = null;
  try {
    webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => webglAddon?.dispose());
    terminal.loadAddon(webglAddon);
  } catch (e) {
    console.warn("WebGL addon failed to load:", e);
  }

  const dataDisposable = terminal.onData((data) =>
    ptyBridge.write(options.paneId, data).catch(() => {})
  );
  const selectionDisposable = terminal.onSelectionChange(() => {
    const text = terminal.getSelection();
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  });
  const resizeDisposable = terminal.onResize(({ rows, cols }) => {
    ptyBridge.resize(options.paneId, rows, cols).catch(() => {});
  });

  let unlistenData: (() => void) | null = null;
  let unlistenExit: (() => void) | null = null;

  try {
    unlistenData = await ptyBridge.onData(options.paneId, (data) => {
      terminal.write(data);
    });
    unlistenExit = await ptyBridge.onExit(options.paneId, () => {
      paneStateStore.updateStatus(options.paneId, "exited");
      terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
    });

    const dims = fitAddon.proposeDimensions();
    await ptyBridge.create({
      id: options.paneId,
      cwd: options.cwd,
      shell: options.shell,
      rows: dims?.rows ?? 24,
      cols: dims?.cols ?? 80,
    });

    const currentState = paneStateStore.getPaneState(options.paneId);
    if (currentState.status !== "exited") {
      paneStateStore.updateStatus(options.paneId, "running");
    }
  } catch (e) {
    // セットアップに失敗した場合は部分的に確保した資源を解放してから伝播
    unlistenData?.();
    unlistenExit?.();
    dataDisposable.dispose();
    selectionDisposable.dispose();
    resizeDisposable.dispose();
    webglAddon?.dispose();
    terminal.dispose();
    rootEl.remove();
    paneStateStore.updateStatus(options.paneId, "error");
    throw e;
  }

  const cleanup = () => {
    unlistenData?.();
    unlistenExit?.();
    dataDisposable.dispose();
    selectionDisposable.dispose();
    resizeDisposable.dispose();
    webglAddon?.dispose();
    terminal.dispose();
    rootEl.remove();
  };

  const entry: TerminalEntry = {
    paneId: options.paneId,
    rootEl,
    terminal,
    fitAddon,
    webglAddon,
  };

  entries.set(options.paneId, entry);
  cleanups.set(options.paneId, cleanup);
  return entry;
}

/** ペインを明示的に閉じる際に呼び出す。Terminal / PTY / 状態をまとめて破棄する */
export function destroyTerminal(paneId: string) {
  const cleanup = cleanups.get(paneId);
  if (cleanup) {
    cleanup();
    cleanups.delete(paneId);
  }
  entries.delete(paneId);
  ptyBridge.destroy(paneId).catch(() => {});
  paneStateStore.deletePane(paneId);
}

export function getTerminalEntry(paneId: string): TerminalEntry | undefined {
  return entries.get(paneId);
}
