import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ptyBridge } from "../pty-bridge";
import { PaneNode, PaneStatus } from "../types";
import { useTheme } from "../ThemeContext";
import { usePaneState, usePaneStateActions } from "../hooks/usePaneState";
import { useTabVisibility } from "./TabContent";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  pane: PaneNode;
  isActive: boolean;
  fontFamily: string;
  fontSize: number;
  onFocus: () => void;
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

export function TerminalPane({
  pane,
  isActive,
  fontFamily,
  fontSize,
  onFocus,
}: TerminalPaneProps) {
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

  const refreshTerminal = useCallback(() => {
    if (terminalRef.current && fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
        // バックエンドが同じサイズでも信号を送るようになったため、
        // 明示的に resize を呼ぶことで PTY 側の redraw を促す
        ptyBridge.resize(
          pane.id, 
          terminalRef.current.rows, 
          terminalRef.current.cols
        );
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      } catch {}
    }
  }, [pane.id]);

  // 1. ターミナルの実体の構築
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily: fontFamily,
      fontSize: fontSize,
      lineHeight: 1.2,
      fontWeight: '500',
      fontWeightBold: 'bold',
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: true,
      scrollback: 5000,
      theme: resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => { openUrl(uri).catch(() => {}); }));
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

        const { paneStateStore } = await import("../services/PaneStateStore");
        const currentState = paneStateStore.getPaneState(pane.id);
        if (currentState.status !== "exited") {
          handleStatusUpdate("running");
        }
        
        requestAnimationFrame(() => {
          if (isDisposed) return;
          requestAnimationFrame(refreshTerminal);
        });

        terminal.onResize(({ rows, cols }) => {
          if (!isDisposed) ptyBridge.resize(pane.id, rows, cols);
        });
      } catch (e) {
        if (!isDisposed) {
          console.error("PTY Setup Error:", e);
          handleStatusUpdate("error");
        }
      }
    };

    connectPty();

    const observer = new ResizeObserver(() => {
      if (isDisposed) return;
      refreshTerminal();
      requestAnimationFrame(() => {
        if (!isDisposed) requestAnimationFrame(refreshTerminal);
      });
    });
    observer.observe(containerRef.current);

    return () => {
      isDisposed = true;
      observer.disconnect();
      unlistenPtyData?.();
      unlistenExit?.();
      dataDisposable.dispose();
      selectionDisposable.dispose();
      webglAddon?.dispose();
      terminal.dispose();
      terminalRef.current = null;
      // コンポーネントが消える（またはID/設定が変わる）際は PTY も破棄する
      ptyBridge.destroy(pane.id).catch(() => {});
      deletePane(pane.id);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id, pane.cwd, pane.shell, deletePane]);

  // 2. テーマ同期
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
      terminalRef.current.refresh(0, terminalRef.current.rows - 1);
    }
  }, [resolvedTheme]);
  
  // 3. フォント同期
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontFamily = fontFamily;
      refreshTerminal();
    }
  }, [fontFamily, refreshTerminal]);

  // 3b. フォントサイズ同期
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = fontSize;
      refreshTerminal();
    }
  }, [fontSize, refreshTerminal]);

  // 4. フォーカスおよびアクティブ時の同期
  useEffect(() => {
    if (isActive && isTabActive && terminalRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (terminalRef.current) {
            terminalRef.current.focus();
            refreshTerminal();
          }
        });
      });
    }
  }, [isActive, isTabActive, refreshTerminal]);

  const borderClass = volatileStatus === "error"
    ? "border-border-error shadow-[0_0_10px_rgba(220,38,38,0.3)]"
    : isActive
      ? "border-accent shadow-[0_0_12px_var(--color-accent-dim)]"
      : "border-border-dim";

  return (
    <div
      className={`terminal-container relative h-full w-full overflow-hidden rounded-md border transition-all duration-300 ${borderClass}`}
      onClick={onFocus}
      style={{
        backgroundColor: isActive ? "var(--bg-surface)" : "var(--bg-main)",
      }}
    >
      <div className={`absolute top-1 right-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-tx-primary/5 transition-all ${isActive && volatileStatus === "running" ? "bg-bg-main/80 shadow-sm backdrop-blur-md" : "bg-bg-main/20 backdrop-blur-sm"
        }`}>
        <div
          className={`h-1.5 w-1.5 rounded-full ${volatileStatus === "running"
            ? "bg-[#22c55e]"
            : "bg-[#ef4444]"
            } ${isActive && volatileStatus === "running" ? "shadow-[0_0_8px_#22c55e] animate-pulse" : ""}`}
        />
        {isActive && volatileStatus === "running" && (
          <span className="text-[8px] font-bold text-[#22c55e] uppercase tracking-widest leading-none" style={{ marginTop: '1px' }}>
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
