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

/** 表示に関わる設定だけを抜き出したもの（再アタッチ時の再同期に使う） */
export type TerminalAppearance = Pick<
  TerminalCreateOptions,
  "fontFamily" | "fontSize" | "theme"
>;

export interface TerminalEntry {
  paneId: string;
  /** xterm を open() する安定したホスト要素。TerminalPane が自分の container に appendChild する */
  rootEl: HTMLDivElement;
  terminal: Terminal;
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
  /**
   * 最後に適用した見た目設定。
   * xterm の `options.theme` ゲッターは代入した値と同一参照を返さないため、
   * 「変わっていないのに代入して再描画（WebGL キャンバスの一瞬のクリア）を
   * 起こす」のを避けるべく、こちらで実際の適用値を覚えておく。
   */
  appearance: TerminalAppearance;
}

/**
 * 生成中（await 中）にペインが閉じられた場合に投げるエラー。
 * 呼び出し側は「異常」ではなく通常のキャンセルとして無視してよい。
 */
export class TerminalDestroyedError extends Error {
  constructor(paneId: string) {
    super(`Terminal for pane ${paneId} was destroyed during creation`);
    this.name = "TerminalDestroyedError";
  }
}

/** 選択テキストの自動コピーをまとめる遅延時間（ドラッグ中の連続発火を抑える） */
const SELECTION_COPY_DEBOUNCE_MS = 120;

const entries = new Map<string, TerminalEntry>();
const cleanups = new Map<string, () => void>();
const pending = new Map<string, Promise<TerminalEntry>>();
/**
 * 「生成中に destroyTerminal された」ペイン ID。
 * これを見ないと、破棄要求のあとに生成が完了した Terminal / PTY が
 * どこからも参照されないまま生き残り、プロセスがリークする。
 */
const destroyRequested = new Set<string>();

export async function getOrCreateTerminal(
  options: TerminalCreateOptions
): Promise<TerminalEntry> {
  const existing = entries.get(options.paneId);
  if (existing) {
    // 生成時と現在で見た目設定がずれている可能性があるため再同期する
    applyAppearance(existing, options);
    return existing;
  }

  const inProgress = pending.get(options.paneId);
  if (inProgress) return inProgress;

  // 新規生成はそれ以前の破棄要求を打ち消す（同じ ID が再利用されることはないが安全側に倒す）
  destroyRequested.delete(options.paneId);

  const promise = createEntry(options);
  pending.set(options.paneId, promise);
  try {
    return await promise;
  } finally {
    pending.delete(options.paneId);
  }
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
  if (current.theme !== next.theme) {
    opts.theme = next.theme;
  }

  entry.appearance = { fontFamily: next.fontFamily, fontSize: next.fontSize, theme: next.theme };
  return needsFit;
}

async function createEntry(options: TerminalCreateOptions): Promise<TerminalEntry> {
  const rootEl = document.createElement("div");
  rootEl.style.height = "100%";
  rootEl.style.width = "100%";
  rootEl.style.background = "transparent";

  const terminal = new Terminal({
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineHeight: 1.35,
    // 小数の letterSpacing はグリフがサブピクセル位置に置かれ滲む原因になるため整数(0)にする
    letterSpacing: 0,
    fontWeight: "500",
    fontWeightBold: "bold",
    cursorBlink: true,
    cursorStyle: "bar",
    cursorWidth: 2,
    // 透明キャンバスへのアルファ合成はアンチエイリアス縁にハロー(滲み)を生む。
    // テーマ背景は --bg-main と一致するため、不透明描画にしても見た目は変わらず文字が締まる。
    allowTransparency: false,
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

  // 選択の自動コピー。onSelectionChange はドラッグ中に高頻度で発火するため、
  // 実際のクリップボード書き込みは操作が落ち着いてから一度だけ行う。
  let copyTimer: number | null = null;
  const selectionDisposable = terminal.onSelectionChange(() => {
    if (copyTimer !== null) window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyTimer = null;
      const text = terminal.getSelection();
      if (text) navigator.clipboard.writeText(text).catch(() => {});
    }, SELECTION_COPY_DEBOUNCE_MS);
  });

  const resizeDisposable = terminal.onResize(({ rows, cols }) => {
    ptyBridge.resize(options.paneId, rows, cols).catch(() => {});
  });

  let unlistenData: (() => void) | null = null;
  let unlistenExit: (() => void) | null = null;

  const disposeAll = () => {
    if (copyTimer !== null) window.clearTimeout(copyTimer);
    unlistenData?.();
    unlistenExit?.();
    dataDisposable.dispose();
    selectionDisposable.dispose();
    resizeDisposable.dispose();
    webglAddon?.dispose();
    terminal.dispose();
    rootEl.remove();
  };

  try {
    unlistenExit = await ptyBridge.onExit(options.paneId, () => {
      paneStateStore.updateStatus(options.paneId, "exited");
      terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
    });

    const dims = fitAddon.proposeDimensions();
    // 出力は create に渡したコールバック（Channel 経由）で受信する
    unlistenData = await ptyBridge.create(
      {
        id: options.paneId,
        cwd: options.cwd,
        shell: options.shell,
        rows: dims?.rows ?? 24,
        cols: dims?.cols ?? 80,
      },
      (data) => {
        terminal.write(data);
      }
    );

    const currentState = paneStateStore.getPaneState(options.paneId);
    if (currentState.status !== "exited") {
      paneStateStore.updateStatus(options.paneId, "running");
    }
  } catch (e) {
    // セットアップに失敗した場合は部分的に確保した資源を解放してから伝播
    disposeAll();
    // 破棄要求が来ていた場合はここで消化する（残すと Set にゴミが残り続ける）
    destroyRequested.delete(options.paneId);
    paneStateStore.updateStatus(options.paneId, "error");
    throw e;
  }

  // 生成待ちの間にペインが閉じられていた場合。ここで畳まないと
  // entries に載らない（＝誰も破棄できない）Terminal と PTY が残る。
  if (destroyRequested.has(options.paneId)) {
    destroyRequested.delete(options.paneId);
    disposeAll();
    ptyBridge.destroy(options.paneId).catch(() => {});
    paneStateStore.deletePane(options.paneId);
    throw new TerminalDestroyedError(options.paneId);
  }

  const entry: TerminalEntry = {
    paneId: options.paneId,
    rootEl,
    terminal,
    fitAddon,
    webglAddon,
    appearance: {
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      theme: options.theme,
    },
  };

  entries.set(options.paneId, entry);
  cleanups.set(options.paneId, disposeAll);
  return entry;
}

/** ペインを明示的に閉じる際に呼び出す。Terminal / PTY / 状態をまとめて破棄する */
export function destroyTerminal(paneId: string) {
  // まだ生成中なら、完了時に createEntry 側で畳んでもらう
  if (!entries.has(paneId) && pending.has(paneId)) {
    destroyRequested.add(paneId);
    return;
  }

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

/** レイアウトから消えたのに registry に残っているペインを掃除する（保険） */
export function destroyOrphanTerminals(livePaneIds: Iterable<string>) {
  const live = new Set(livePaneIds);
  for (const paneId of [...entries.keys(), ...pending.keys()]) {
    if (!live.has(paneId)) destroyTerminal(paneId);
  }
}
