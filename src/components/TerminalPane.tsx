import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { ptyBridge } from "../pty-bridge";
import { PaneNode, PaneStatus } from "../types";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  pane: PaneNode;
  isActive: boolean;
  onFocus: () => void;
  onStatusChange?: (status: PaneStatus) => void;
}

export function TerminalPane({
  pane,
  isActive,
  onFocus,
  onStatusChange,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<PaneStatus>("running");
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const updateStatus = useCallback(
    (newStatus: PaneStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: true,
      theme: {
        background: "rgba(10, 14, 23, 0.85)",
        foreground: "#e2e8f0",
        cursor: "#6366f1",
        cursorAccent: "#0a0e17",
        selectionBackground: "rgba(99, 102, 241, 0.35)",
        selectionForeground: "#f1f5f9",
        black: "#1e293b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e2e8f0",
        brightBlack: "#475569",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f8fafc",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    // WebGL アドオンの読み込み（フォールバック付き）
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon failed to load, using canvas renderer:", e);
    }

    // 初回フィット
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // PTYの作成と接続
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    const initPty = async () => {
      try {
        const dims = fitAddon.proposeDimensions();

        // 先にリスナーを登録する（IDは既知）
        unlistenData = await ptyBridge.onData(pane.id, (data) => {
          terminal.write(data);
        });

        // PTY終了時の処理も先に登録
        unlistenExit = await ptyBridge.onExit(pane.id, () => {
          updateStatus("exited");
          terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        });

        // その後に PTY を作成
        await ptyBridge.create({
          id: pane.id,
          cwd: pane.cwd,
          shell: pane.shell,
          rows: dims?.rows ?? 24,
          cols: dims?.cols ?? 80,
        });

        // ターミナルからの入力をPTYに送信
        terminal.onData((data) => {
          ptyBridge.write(pane.id, data);
        });

        // ターミナルリサイズ時にPTYにも通知
        terminal.onResize(({ rows, cols }) => {
          ptyBridge.resize(pane.id, rows, cols);
        });
      } catch (e) {
        console.error("Failed to initialize PTY:", e);
        updateStatus("error");
        terminal.write(
          `\r\n\x1b[31m[Failed to start terminal: ${e}]\x1b[0m\r\n`
        );
      }
    };

    initPty();

    // ResizeObserverでコンテナサイズの変更を検知
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch {
            // フィット失敗は無視
          }
        }
      });
    });
    observer.observe(containerRef.current);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      unlistenData?.();
      unlistenExit?.();
      ptyBridge.destroy(pane.id).catch(() => {});
      terminal.dispose();
    };
  }, [pane.id]);

  // アクティブ状態が変わったらフォーカスを移動
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  // ステータスに応じたボーダーカラー
  const borderClass =
    status === "error"
      ? "glow-error"
      : isActive
        ? "glow-active border-accent-primary/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
        : "border-border-default/20";

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-md transition-all duration-300 border ${borderClass}`}
      onClick={onFocus}
      style={{
        backgroundColor: isActive 
          ? "rgba(10, 14, 23, 0.9)" 
          : "rgba(10, 14, 23, 0.8)",
      }}
    >
      {/* フォーカス時のオーバーレイ光彩 */}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-accent-primary/5 to-transparent opacity-30" />
      )}

      {/* ステータスインジケーター */}
      <div className="absolute top-1.5 right-2 z-10 flex items-center gap-1.5">
        <div
          className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
            isActive && status === "running"
              ? "bg-accent-emerald shadow-[0_0_8px_#34d399]"
              : "bg-text-muted opacity-30"
          }`}
        />
        {isActive && (
          <span className="text-[10px] font-medium text-accent-primary/60 uppercase tracking-tighter">
            Active
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ background: "rgba(10, 14, 23, 0.85)" }}
      />
    </div>
  );
}
