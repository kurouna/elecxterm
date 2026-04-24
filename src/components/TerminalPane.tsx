import { memo, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ptyBridge } from "../pty-bridge";
import { PaneNode, PaneStatus } from "../types";
import { useTheme } from "../ThemeContext";
import { usePaneState, usePaneStateActions } from "../hooks/usePaneState";
import { paneStateStore } from "../services/PaneStateStore";
import { useTabVisibility } from "./TabContent";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  pane: PaneNode;
  isActive: boolean;
  fontFamily: string;
  fontSize: number;
  onActivate: (id: string) => void;
}

const DARK_THEME = {
  background: "#05070a",
  foreground: "#f8fafc",
  cursor: "#818cf8",
  cursorAccent: "#05070a",
  selectionBackground: "rgba(129, 140, 248, 0.35)",
  selectionForeground: "#ffffff",
  black: "#0f172a",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#818cf8",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#f1f5f9",
  brightBlack: "#475569",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde68a",
  brightBlue: "#a5b4fc",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#1e293b",
  cursor: "#2563eb",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(37, 99, 235, 0.15)",
  selectionForeground: "#1e293b",
  black: "#0f172a",
  red: "#be123c",
  green: "#15803d",
  yellow: "#a16207",
  blue: "#1d4ed8",
  magenta: "#7e22ce",
  cyan: "#0e7490",
  white: "#475569",
  brightBlack: "#64748b",
  brightRed: "#e11d48",
  brightGreen: "#16a34a",
  brightYellow: "#ca8a04",
  brightBlue: "#2563eb",
  brightMagenta: "#9333ea",
  brightCyan: "#0891b2",
  brightWhite: "#0f172a",
};

function TerminalPaneComponent({
  pane,
  isActive,
  fontFamily,
  fontSize,
  onActivate,
}: TerminalPaneProps) {
  const handleClick = useCallback(() => {
    onActivate(pane.id);
  }, [onActivate, pane.id]);
  const { resolvedTheme } = useTheme();
  const { isActive: isTabActive } = useTabVisibility();

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const { status: volatileStatus } = usePaneState(pane.id);
  const { updateStatus, deletePane } = usePaneStateActions();

  const handleStatusUpdate = useCallback(
    (newStatus: PaneStatus) => {
      updateStatus(pane.id, newStatus);
    },
    [pane.id, updateStatus]
  );

  /**
   * フィット + PTY サイズ通知。xterm 側が適切なタイミングで
   * 自前の再描画を行うため、ここでは `refresh()` を呼ばない。
   * 明示的な `refresh()` は WebGL キャンバスの一瞬のクリアを誘発し、
   * タブ/ペイン切替時のフラッシュの原因になる。
   */
  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    try {
      fitAddon.fit();
    } catch {
      // fit が 0 サイズ等で失敗してもサイレントに無視
      return;
    }
    // PTY 作成前（マウント直後の競合）や破棄後の呼び出しで reject される
    // 可能性があるので、未処理 rejection を握りつぶす。
    ptyBridge.resize(pane.id, terminal.rows, terminal.cols).catch(() => {});
  }, [pane.id]);

  // 1. ターミナルの実体の構築
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily,
      fontSize,
      lineHeight: 1.2,
      fontWeight: "500",
      fontWeightBold: "bold",
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: true,
      scrollback: 5000,
      theme: resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(
      new WebLinksAddon((_event, uri) => {
        openUrl(uri).catch(() => {});
      })
    );
    terminal.open(containerRef.current);

    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon?.dispose());
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon failed to load:", e);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    let isDisposed = false;
    let unlistenPtyData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    const dataDisposable = terminal.onData((data) => ptyBridge.write(pane.id, data));

    // 選択即コピー（copy-on-select）
    const selectionDisposable = terminal.onSelectionChange(() => {
      const text = terminal.getSelection();
      if (text) navigator.clipboard.writeText(text).catch(() => {});
    });

    const resizeDisposable = terminal.onResize(({ rows, cols }) => {
      if (isDisposed) return;
      ptyBridge.resize(pane.id, rows, cols).catch(() => {});
    });

    const connectPty = async () => {
      try {
        const uData = await ptyBridge.onData(pane.id, (data) => {
          terminal.write(data);
        });
        if (isDisposed) {
          uData();
          return;
        }
        unlistenPtyData = uData;

        const uExit = await ptyBridge.onExit(pane.id, () => {
          handleStatusUpdate("exited");
          terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        });
        if (isDisposed) {
          uExit();
          return;
        }
        unlistenExit = uExit;

        const dims = fitAddon.proposeDimensions();
        await ptyBridge.create({
          id: pane.id,
          cwd: pane.cwd,
          shell: pane.shell,
          rows: dims?.rows ?? 24,
          cols: dims?.cols ?? 80,
        });

        if (isDisposed) return;

        const currentState = paneStateStore.getPaneState(pane.id);
        if (currentState.status !== "exited") {
          handleStatusUpdate("running");
        }

        // 初回描画が安定した次フレームで一度だけフィット
        requestAnimationFrame(() => {
          if (!isDisposed) fitAndResize();
        });
      } catch (e) {
        if (!isDisposed) {
          console.error("PTY Setup Error:", e);
          handleStatusUpdate("error");
        }
      }
    };

    connectPty();

    // xterm-addon-fit の `fit()` は行/列数が変化すると内部で
    // `_renderService.clear()` を呼び、次の描画まで 1 フレーム分の
    // 空白フレームを作る。ウィンドウドラッグのように毎フレーム寸法が
    // 変わる場面では、このクリアが連続して発生しチラつきの原因となる。
    // そこで ResizeObserver は末尾デバウンスし、リサイズが落ち着いた
    // タイミングで 1 度だけ fit する。
    const RESIZE_SETTLE_MS = 100;
    let resizeTimeoutId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (isDisposed) return;
      if (resizeTimeoutId !== null) window.clearTimeout(resizeTimeoutId);
      resizeTimeoutId = window.setTimeout(() => {
        resizeTimeoutId = null;
        if (!isDisposed) fitAndResize();
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(containerRef.current);

    return () => {
      isDisposed = true;
      if (resizeTimeoutId !== null) window.clearTimeout(resizeTimeoutId);
      observer.disconnect();
      unlistenPtyData?.();
      unlistenExit?.();
      dataDisposable.dispose();
      selectionDisposable.dispose();
      resizeDisposable.dispose();
      webglAddon?.dispose();
      terminal.dispose();
      terminalRef.current = null;
      // コンポーネントが消える（またはID/設定が変わる）際は PTY も破棄する
      ptyBridge.destroy(pane.id).catch(() => {});
      deletePane(pane.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id, pane.cwd, pane.shell, deletePane]);

  // 2. テーマ同期 — options 代入のみ。xterm が次の描画サイクルで反映する。
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
  }, [resolvedTheme]);

  // 3. フォントファミリー同期 — 文字幅が変わるので fit が必要
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = fontFamily;
    fitAndResize();
  }, [fontFamily, fitAndResize]);

  // 4. フォントサイズ同期
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    fitAndResize();
  }, [fontSize, fitAndResize]);

  // 5. アクティブペイン & アクティブタブのときのみフォーカス
  // refresh や fit は呼ばない（ResizeObserver が必要時に fit する）。
  useEffect(() => {
    if (!isActive || !isTabActive) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    // 可視化直後にフォーカスが奪われないよう次フレームでフォーカス
    const raf = requestAnimationFrame(() => {
      terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, isTabActive]);

  const borderClass =
    volatileStatus === "error"
      ? "border-border-error shadow-[0_0_10px_rgba(220,38,38,0.3)]"
      : isActive
        ? "border-accent shadow-[0_0_12px_var(--color-accent-dim)]"
        : "border-border-dim";

  return (
    <div
      className={`terminal-container relative h-full w-full overflow-hidden rounded-md border transition-[border-color,background-color,box-shadow] duration-200 ${borderClass}`}
      onClick={handleClick}
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "var(--bg-main)",
      }}
    >
      <div
        className={`absolute top-1 right-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-tx-primary/5 transition-colors duration-200 ${
          isActive && volatileStatus === "running"
            ? "bg-bg-main/80 shadow-sm backdrop-blur-md"
            : "bg-bg-main/20 backdrop-blur-sm"
        }`}
      >
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            volatileStatus === "running" ? "bg-[#22c55e]" : "bg-[#ef4444]"
          } ${
            isActive && volatileStatus === "running"
              ? "shadow-[0_0_8px_#22c55e] animate-pulse"
              : ""
          }`}
        />
        {isActive && volatileStatus === "running" && (
          <span
            className="text-[8px] font-bold text-[#22c55e] uppercase tracking-widest leading-none"
            style={{ marginTop: "1px" }}
          >
            Active
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ background: "transparent" }}
      />
    </div>
  );
}

export const TerminalPane = memo(TerminalPaneComponent);
