import { Terminal, ITheme, IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ptyBridge } from "../pty-bridge";
import { paneStateStore } from "./PaneStateStore";
import { paneElement, powerOn } from "./crt";
import type { CursorStyle } from "../types";

/**
 * Terminal/PTY インスタンスの寿命を React ツリーから切り離して管理する。
 * ペイン分割・クローズ時のレイアウト再構築で TerminalPane が再マウントされても
 * 同じ xterm / PTY を別のホスト要素に付け替えるだけで、カレントディレクトリや
 * スクロールバックを失わないようにする。
 *
 * xterm は同期的に生成してすぐホストへ貼り付ける（文字寸法を正しく測れ、
 * 最初から正しいサイズで PTY を起動できる）。PTY の起動だけが非同期で、
 * その間のキー入力は `ready` の完了を待ってから順序どおり送られる。
 */

export interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  theme: ITheme;
}

export interface TerminalAttachOptions extends TerminalAppearance {
  paneId: string;
  cwd?: string;
  shell?: string;
}

export interface TerminalEntry {
  paneId: string;
  /** xterm を open() した安定したホスト要素。TerminalPane が自分の container に appendChild する */
  rootEl: HTMLDivElement;
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  /**
   * 最後に適用した見た目設定。
   * xterm の `options.theme` ゲッターは代入した値と同一参照を返さないため、
   * 「変わっていないのに代入して再描画（WebGL キャンバスの一瞬のクリア）を
   * 起こす」のを避けるべく、こちらで実際の適用値を覚えておく。
   */
  appearance: TerminalAppearance;
  /** 生成した時刻。マウント時に「新しく開いた端末か」を判断して電源オン演出を出すのに使う */
  createdAt: number;
  /** まとめて生成された（起動時の復元など）ときに、順番に電源が入るよう遅らせる時間 */
  powerOnDelay: number;
}

interface InternalEntry extends TerminalEntry {
  /**
   * 現在の PTY の ID。再起動のたびに変える（同じ ID だと、古いプロセスの
   * 終了イベントが新しいプロセスの終了として届いてしまう）。
   */
  ptyId: string;
  generation: number;
  shell?: string;
  cwd?: string;
  /** 現在の PTY が入力を受け付けられるようになったら true で解決する */
  ready: Promise<boolean>;
  disposed: boolean;
  /** 現在の PTY に紐づく購読の解除 */
  disposePty: () => void;
  disposeTerminal: () => void;
  /** シェル統合の追跡状態（実行中コマンドなど）を捨てる。シェルの再起動時に使う */
  resetShellState: () => void;
  /** 実行中のコマンド名をその場で端末から読み直す（実行中でなければ null） */
  readRunningCommand: () => string | null;
}

const entries = new Map<string, InternalEntry>();

/** 立て続けに生成された端末を 1 つの「まとまり」とみなす間隔と、順番に点灯させる刻み */
const BURST_WINDOW_MS = 400;
const POWER_ON_STAGGER_MS = 70;
let lastCreatedAt = 0;
let burstIndex = 0;

/**
 * ペインの Terminal をホスト要素に貼り付ける。無ければ生成して PTY を起動する。
 * 既存の場合は見た目を再同期して付け替えるだけ。
 */
export function attachTerminal(host: HTMLElement, options: TerminalAttachOptions): TerminalEntry {
  const existing = entries.get(options.paneId);
  if (existing) {
    host.appendChild(existing.rootEl);
    applyAppearance(existing, options);
    return existing;
  }
  const entry = createEntry(host, options);
  entries.set(options.paneId, entry);
  startPty(entry);
  return entry;
}

/**
 * 既存の Terminal に見た目設定を反映する。実際に変わった項目だけを代入し、
 * 「文字寸法が変わったか（＝ fit が必要か）」を返す。
 */
export function applyAppearance(entry: TerminalEntry, next: TerminalAppearance): boolean {
  const current = entry.appearance;
  const opts = entry.terminal.options;
  let needsFit = false;

  if (current.fontFamily !== next.fontFamily) {
    opts.fontFamily = next.fontFamily;
    needsFit = true;
  }
  if (current.fontSize !== next.fontSize) {
    opts.fontSize = next.fontSize;
    needsFit = true;
  }
  if (current.lineHeight !== next.lineHeight) {
    opts.lineHeight = next.lineHeight;
    needsFit = true;
  }
  if (current.cursorStyle !== next.cursorStyle) opts.cursorStyle = next.cursorStyle;
  if (current.cursorBlink !== next.cursorBlink) opts.cursorBlink = next.cursorBlink;
  if (current.theme !== next.theme) {
    opts.theme = next.theme;
  }

  entry.appearance = pickAppearance(next);
  return needsFit;
}

function pickAppearance(a: TerminalAppearance): TerminalAppearance {
  return {
    fontFamily: a.fontFamily,
    fontSize: a.fontSize,
    lineHeight: a.lineHeight,
    cursorStyle: a.cursorStyle,
    cursorBlink: a.cursorBlink,
    theme: a.theme,
  };
}

function createEntry(host: HTMLElement, options: TerminalAttachOptions): InternalEntry {
  const { paneId } = options;
  const rootEl = document.createElement("div");
  rootEl.className = "terminal-root";
  host.appendChild(rootEl);

  const terminal = new Terminal({
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
    // 小数の letterSpacing はグリフがサブピクセル位置に置かれ滲む原因になるため整数(0)にする
    letterSpacing: 0,
    fontWeight: "500",
    fontWeightBold: "bold",
    cursorBlink: options.cursorBlink,
    cursorStyle: options.cursorStyle,
    cursorWidth: 2,
    cursorInactiveStyle: "outline",
    // 透明キャンバスへのアルファ合成はアンチエイリアス縁にハロー(滲み)を生む。
    // テーマ背景は --bg-main と一致するため、不透明描画にしても見た目は変わらず文字が締まる。
    allowTransparency: false,
    allowProposedApi: true,
    scrollback: 10000,
    smoothScrollDuration: 0,
    theme: options.theme,
  });

  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(
    new WebLinksAddon((_event, uri) => {
      openUrl(uri).catch(() => {});
    })
  );
  terminal.open(rootEl);

  let webglAddon: WebglAddon | null = null;
  try {
    webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon?.dispose();
      webglAddon = null;
    });
    terminal.loadAddon(webglAddon);
  } catch (e) {
    console.warn("WebGL addon failed to load:", e);
  }

  try {
    fitAddon.fit();
  } catch {
    // ホストがまだレイアウトされていなければ既定サイズのまま起動し、後の fit で合わせる
  }

  const createdAt = Date.now();
  burstIndex = createdAt - lastCreatedAt < BURST_WINDOW_MS ? burstIndex + 1 : 0;
  lastCreatedAt = createdAt;

  const entry: InternalEntry = {
    paneId,
    createdAt,
    powerOnDelay: Math.min(burstIndex, 8) * POWER_ON_STAGGER_MS,
    ptyId: paneId,
    generation: 0,
    rootEl,
    terminal,
    fitAddon,
    searchAddon,
    appearance: pickAppearance(options),
    shell: options.shell,
    cwd: options.cwd,
    ready: Promise.resolve(false),
    disposed: false,
    disposePty: () => {},
    disposeTerminal: () => {},
    resetShellState: () => {},
    readRunningCommand: () => null,
  };

  // --- シェル統合: カレントディレクトリ (OSC 9;9 = Windows Terminal 方式 / OSC 7) ---
  const oscCwd = terminal.parser.registerOscHandler(9, (data) => {
    if (!data.startsWith("9;")) return false;
    const cwd = data.slice(2).replace(/^"(.*)"$/, "$1");
    if (cwd) paneStateStore.update(paneId, { cwd });
    return true;
  });
  const oscFileUrl = terminal.parser.registerOscHandler(7, (data) => {
    try {
      const url = new URL(data);
      let path = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1).replace(/\//g, "\\");
      if (path) paneStateStore.update(paneId, { cwd: path });
    } catch {
      // 不正な URL は無視
    }
    return true;
  });
  // --- シェル統合: コマンドの開始・終了 (OSC 133 / FinalTerm マーク) ---
  // A = プロンプト開始（= 直前のコマンドの終了）、B = プロンプト終了（入力開始位置）、
  // C = コマンド実行開始、D;<code> = コマンド終了。cmd は C を出せないため、
  // プロンプト上で Enter が押された時点を開始とみなす。
  // 入力開始位置はマーカーで覚える（スクロールバックが溢れて行番号がずれても追従する）。
  // コマンド文字列はシェルのエコーが描画されてから読む必要があるため、Enter の直後ではなく
  // 少し遅らせて／完了時に読み直す。
  let promptEnd: { marker: IMarker; col: number } | null = null;
  let running: { command: string; startedAt: number; anchor: { marker: IMarker; col: number } | null } | null = null;
  let lastExitCode: number | undefined;
  let readTimer: number | null = null;

  const readCommandLine = (anchor: { marker: IMarker; col: number } | null): string => {
    if (!anchor || anchor.marker.isDisposed || anchor.marker.line < 0) return "";
    const buffer = terminal.buffer.active;
    const row = anchor.marker.line;
    let text = buffer.getLine(row)?.translateToString(true, anchor.col) ?? "";
    for (let y = row + 1; buffer.getLine(y)?.isWrapped; y++) {
      text += buffer.getLine(y)?.translateToString(true) ?? "";
    }
    return text.trim();
  };

  const clearPromptEnd = () => {
    promptEnd?.marker.dispose();
    promptEnd = null;
  };

  const startCommand = () => {
    if (running) return;
    running = { command: "", startedAt: Date.now(), anchor: promptEnd };
    promptEnd = null;
    lastExitCode = undefined;
    paneStateStore.commandStarted(paneId, "…", running.startedAt);
    // エコーが描画された頃にコマンド名を読み、実行中表示を更新する
    if (readTimer !== null) window.clearTimeout(readTimer);
    readTimer = window.setTimeout(() => {
      readTimer = null;
      entry.readRunningCommand();
    }, 150);
  };

  const finishCommand = () => {
    if (!running) return;
    const run = running;
    running = null;
    if (readTimer !== null) window.clearTimeout(readTimer);
    readTimer = null;
    const command = readCommandLine(run.anchor) || run.command;
    run.anchor?.marker.dispose();
    paneStateStore.commandFinished({
      paneId,
      command,
      durationMs: Date.now() - run.startedAt,
      exitCode: lastExitCode,
      finishedAt: Date.now(),
    });
  };

  entry.readRunningCommand = () => {
    if (!running) return null;
    const command = readCommandLine(running.anchor) || running.command;
    if (command !== running.command) {
      running.command = command;
      paneStateStore.commandStarted(paneId, command, running.startedAt);
    }
    return command || null;
  };

  entry.resetShellState = () => {
    clearPromptEnd();
    running?.anchor?.marker.dispose();
    running = null;
    lastExitCode = undefined;
    if (readTimer !== null) window.clearTimeout(readTimer);
    readTimer = null;
  };

  const osc133 = terminal.parser.registerOscHandler(133, (data) => {
    const [kind, arg] = data.split(";");
    if (kind === "A") {
      finishCommand();
    } else if (kind === "B") {
      clearPromptEnd();
      const marker = terminal.registerMarker(0);
      if (marker) promptEnd = { marker, col: terminal.buffer.active.cursorX };
    } else if (kind === "C") {
      startCommand();
    } else if (kind === "D") {
      const code = Number(arg);
      lastExitCode = arg !== undefined && arg !== "" && Number.isFinite(code) ? code : undefined;
    }
    return true;
  });

  const titleDisposable = terminal.onTitleChange((title) => paneStateStore.update(paneId, { title }));
  const bellDisposable = terminal.onBell(() => paneStateStore.markBell(paneId));

  // --- 入力 ---
  const dataDisposable = terminal.onData((data) => {
    const { status } = paneStateStore.getPaneState(paneId);
    // 終了したペインでは Enter でシェルを再起動する
    if (status === "exited" || status === "error") {
      if (data === "\r") restartTerminal(paneId);
      return;
    }
    // プロンプト上での Enter をコマンド開始とみなす（入力行は送信前に読む）
    if (promptEnd && !running && data.includes("\r")) startCommand();
    // ready を経由することで、PTY 起動前に打たれたキーも順序どおり送られる
    entry.ready.then((ok) => {
      if (ok) ptyBridge.write(entry.ptyId, data).catch(() => {});
    });
  });

  // コピー & ペースト（Windows Terminal と同じ既定）。
  // false を返したキーは xterm が処理せず、ブラウザ既定の paste イベントが
  // xterm の textarea に届くため bracketed paste も xterm に任せられる。
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown" || !e.ctrlKey || e.altKey || e.metaKey) return true;
    const key = e.key.toLowerCase();
    if (key === "v") return false;
    if (key === "c" && (e.shiftKey || terminal.hasSelection())) {
      copySelection(terminal);
      if (!e.shiftKey) terminal.clearSelection();
      e.preventDefault();
      return false;
    }
    return true;
  });

  // 選択の自動コピー（Windows Terminal の copyOnSelect と同じく、マウスを離した時点で 1 回）。
  // onSelectionChange で拾うと、検索ハイライトなどプログラムによる選択までコピーしてしまう。
  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 0 && terminal.hasSelection()) copySelection(terminal);
  };
  rootEl.addEventListener("pointerup", onPointerUp);

  const resizeDisposable = terminal.onResize(({ rows, cols }) => {
    entry.ready.then((ok) => {
      if (ok) ptyBridge.resize(entry.ptyId, rows, cols).catch(() => {});
    });
  });

  entry.disposeTerminal = () => {
    rootEl.removeEventListener("pointerup", onPointerUp);
    entry.resetShellState();
    [oscCwd, oscFileUrl, osc133, titleDisposable, bellDisposable, dataDisposable, resizeDisposable]
      .forEach((d) => d.dispose());
    webglAddon?.dispose();
    terminal.dispose();
    rootEl.remove();
  };

  return entry;
}

function copySelection(terminal: Terminal) {
  const text = terminal.getSelection();
  if (text) navigator.clipboard.writeText(text).catch(() => {});
}

/** PTY を起動して entry に結び付ける。再起動時も同じ経路を通る */
function startPty(entry: InternalEntry) {
  const { paneId, terminal } = entry;
  const ptyId = entry.generation === 0 ? paneId : `${paneId}_r${entry.generation}`;
  entry.ptyId = ptyId;
  entry.resetShellState();
  paneStateStore.register(paneId);

  let disposed = false;
  let unlistenExit: (() => void) | null = null;
  let disposeData: (() => void) | null = null;
  entry.disposePty = () => {
    disposed = true;
    unlistenExit?.();
    disposeData?.();
  };

  entry.ready = (async () => {
    try {
      // 終了イベントは起動直後に飛んでくることもあるので、PTY 生成前に購読しておく
      unlistenExit = await ptyBridge.onExit(ptyId, (code) => {
        paneStateStore.update(paneId, { status: "exited", exitCode: code });
        const detail = code === null ? "" : ` with code ${code}`;
        terminal.write(`\r\n\x1b[90m[Process exited${detail}] Press Enter to restart.\x1b[0m\r\n`);
      });
      if (disposed) {
        unlistenExit();
        return false;
      }

      const { shell, dispose } = await ptyBridge.create(
        { id: ptyId, cwd: entry.cwd, shell: entry.shell, rows: terminal.rows, cols: terminal.cols },
        (data) => {
          terminal.write(data);
          paneStateStore.markOutput(paneId);
        }
      );
      disposeData = dispose;

      // 生成待ちの間にペインが閉じられていた場合。ここで畳まないと
      // 誰も破棄できない PTY プロセスが残る。
      if (disposed || entry.disposed) {
        dispose();
        ptyBridge.destroy(ptyId).catch(() => {});
        return false;
      }

      if (paneStateStore.getPaneState(paneId).status === "starting") {
        paneStateStore.update(paneId, { status: "running", shell });
      }
      return true;
    } catch (e) {
      if (disposed) return false;
      paneStateStore.update(paneId, { status: "error" });
      terminal.write(`\r\n\x1b[31mFailed to start shell: ${String(e)}\x1b[0m\r\n`);
      terminal.write("\x1b[90mPress Enter to retry.\x1b[0m\r\n");
      return false;
    }
  })();

  // 起動中に fit でサイズが変わっていたら、起動後に合わせ直す
  const requested = { rows: terminal.rows, cols: terminal.cols };
  entry.ready.then((ok) => {
    if (ok && (terminal.rows !== requested.rows || terminal.cols !== requested.cols)) {
      ptyBridge.resize(ptyId, terminal.rows, terminal.cols).catch(() => {});
    }
  });
}

/** 終了したペインのシェルを、最後に分かっているディレクトリで起動し直す */
export function restartTerminal(paneId: string) {
  const entry = entries.get(paneId);
  if (!entry || entry.disposed) return;
  entry.disposePty();
  ptyBridge.destroy(entry.ptyId).catch(() => {});
  entry.generation += 1;
  entry.cwd = paneStateStore.getPaneState(paneId).cwd ?? entry.cwd;
  entry.terminal.write("\x1b[2J\x1b[3J\x1b[H");
  // 再起動は電源の入れ直し
  powerOn(paneElement(paneId), 480);
  startPty(entry);
}

/** ペインを明示的に閉じる際に呼び出す。Terminal / PTY / 状態をまとめて破棄する */
export function destroyTerminal(paneId: string) {
  const entry = entries.get(paneId);
  if (entry) {
    entry.disposed = true;
    entry.disposePty();
    entry.disposeTerminal();
    entries.delete(paneId);
  }
  ptyBridge.destroy(entry?.ptyId ?? paneId).catch(() => {});
  paneStateStore.deletePane(paneId);
}

export function getTerminalEntry(paneId: string): TerminalEntry | undefined {
  return entries.get(paneId);
}

/**
 * ペインで実行中のコマンド名（シェル統合で分かる場合のみ）。表示用のストアは
 * エコー描画を待って少し遅れて更新されるため、閉じる前の確認などではこちらで最新を読む。
 */
export function getRunningCommand(paneId: string): string | null {
  return entries.get(paneId)?.readRunningCommand() ?? null;
}

/** ペインの端末にキーボードフォーカスを移す */
export function focusTerminal(paneId: string) {
  entries.get(paneId)?.terminal.focus();
}

/** ペインの端末に文字列を貼り付ける（bracketed paste 対応） */
export function pasteToTerminal(paneId: string, text: string) {
  entries.get(paneId)?.terminal.paste(text);
}

/** 現在の選択範囲をコピーする。選択が無ければ false */
export function copyTerminalSelection(paneId: string): boolean {
  const terminal = entries.get(paneId)?.terminal;
  if (!terminal?.hasSelection()) return false;
  copySelection(terminal);
  return true;
}

export function clearTerminal(paneId: string) {
  entries.get(paneId)?.terminal.clear();
}

/**
 * 端末の末尾 `maxLines` 行をプレーンテキストで返す（概要表示のプレビュー用）。
 * カーソル行より下の空行と末尾の空白は落とす。
 */
export function getTerminalSnapshot(paneId: string, maxLines: number): string[] {
  const terminal = entries.get(paneId)?.terminal;
  if (!terminal) return [];
  const buffer = terminal.buffer.active;
  let last = buffer.baseY + buffer.cursorY;
  while (last > 0 && !buffer.getLine(last)?.translateToString(true).trim()) last--;
  const lines: string[] = [];
  for (let y = Math.max(0, last - maxLines + 1); y <= last; y++) {
    lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
  }
  return lines;
}

/** レイアウトから消えたのに registry に残っているペインを掃除する（保険） */
export function destroyOrphanTerminals(livePaneIds: Iterable<string>) {
  const live = new Set(livePaneIds);
  for (const paneId of [...entries.keys()]) {
    if (!live.has(paneId)) destroyTerminal(paneId);
  }
}

// 開発時のみ: e2e テストが「アプリが実際に使っている」レジストリから画面の文字を読めるようにする
// （テスト側で動的 import すると、HMR 後は別のモジュールインスタンスを読んでしまうため）
if (import.meta.env.DEV) {
  (window as unknown as { __ELECXTERM_REGISTRY__: unknown }).__ELECXTERM_REGISTRY__ = { getTerminalSnapshot };
}
