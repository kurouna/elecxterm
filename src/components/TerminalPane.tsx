import { memo, useEffect, useRef, useCallback } from "react";
import { ptyBridge } from "../pty-bridge";
import { PaneNode } from "../types";
import { useTheme } from "../ThemeContext";
import { usePaneState } from "../hooks/usePaneState";
import { useTabVisibility } from "./TabContent";
import { getOrCreateTerminal, TerminalEntry } from "../services/terminalRegistry";
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
  const entryRef = useRef<TerminalEntry | null>(null);

  const { status: volatileStatus } = usePaneState(pane.id);

  /**
   * フィット + PTY サイズ通知。xterm 側が適切なタイミングで
   * 自前の再描画を行うため、ここでは `refresh()` を呼ばない。
   * 明示的な `refresh()` は WebGL キャンバスの一瞬のクリアを誘発し、
   * タブ/ペイン切替時のフラッシュの原因になる。
   */
  const fitAndResize = useCallback(() => {
    const entry = entryRef.current;
    if (!entry) return;
    try {
      entry.fitAddon.fit();
    } catch {
      return;
    }
    ptyBridge
      .resize(pane.id, entry.terminal.rows, entry.terminal.cols)
      .catch(() => {});
  }, [pane.id]);

  // 1. Registry から Terminal を取得してホスト要素に貼り付ける。
  //    アンマウント時は Terminal を破棄せず DOM から外すだけ。これにより
  //    レイアウトツリー再構築で TerminalPane が再マウントされても
  //    同じ xterm/PTY を継続利用でき、カレントディレクトリがリセットされない。
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    let cancelled = false;

    getOrCreateTerminal({
      paneId: pane.id,
      cwd: pane.cwd,
      shell: pane.shell,
      fontFamily,
      fontSize,
      theme: resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME,
    })
      .then((entry) => {
        if (cancelled) return;
        entryRef.current = entry;
        host.appendChild(entry.rootEl);
        // 再アタッチ直後はホストのサイズが変わっている可能性があるので一度 fit
        requestAnimationFrame(() => {
          if (!cancelled) fitAndResize();
        });
      })
      .catch((e) => {
        if (!cancelled) console.error("Terminal setup error:", e);
      });

    return () => {
      cancelled = true;
      // Terminal は破棄せず DOM から切り離すだけ。破棄は closePane/closeTab が行う。
      entryRef.current?.rootEl.remove();
      entryRef.current = null;
    };
    // pane.id 以外のプロパティは初回生成時にだけ反映。以降は個別 effect で更新する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id]);

  // 2. テーマ同期 — options 代入のみ。xterm が次の描画サイクルで反映する。
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.terminal.options.theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
  }, [resolvedTheme]);

  // 3. フォントファミリー同期 — 文字幅が変わるので fit が必要
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.terminal.options.fontFamily = fontFamily;
    fitAndResize();
  }, [fontFamily, fitAndResize]);

  // 4. フォントサイズ同期
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.terminal.options.fontSize = fontSize;
    fitAndResize();
  }, [fontSize, fitAndResize]);

  // 5. アクティブペイン & アクティブタブのときのみフォーカス
  useEffect(() => {
    if (!isActive || !isTabActive) return;
    const raf = requestAnimationFrame(() => {
      entryRef.current?.terminal.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, isTabActive]);

  // 6. ResizeObserver — コンテナ寸法が落ち着いたタイミングで一度だけ fit
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const RESIZE_SETTLE_MS = 100;
    let resizeTimeoutId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimeoutId !== null) window.clearTimeout(resizeTimeoutId);
      resizeTimeoutId = window.setTimeout(() => {
        resizeTimeoutId = null;
        fitAndResize();
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(host);
    return () => {
      if (resizeTimeoutId !== null) window.clearTimeout(resizeTimeoutId);
      observer.disconnect();
    };
  }, [fitAndResize]);

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
