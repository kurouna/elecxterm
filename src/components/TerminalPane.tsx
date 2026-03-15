import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { ptyBridge } from "../pty-bridge";
import { PaneNode, PaneStatus } from "../types";
import { useTheme } from "../ThemeContext";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  pane: PaneNode;
  isActive: boolean;
  onFocus: () => void;
  onStatusChange?: (status: PaneStatus) => void;
}

const DARK_THEME = {
  background: "#05070a",
  foreground: "#e2e8f0",
  cursor: "#818cf8",
  cursorAccent: "#05070a",
  selectionBackground: "rgba(129, 140, 248, 0.25)",
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
  cursor: "#3b82f6",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(59, 130, 246, 0.15)",
  selectionForeground: "#1e293b",
  black: "#f1f5f9",
  red: "#ef4444",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  magenta: "#8b5cf6",
  cyan: "#06b6d4",
  white: "#1e293b",
  brightBlack: "#94a3b8",
  brightRed: "#fca5a5",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#60a5fa",
  brightMagenta: "#a78bfa",
  brightCyan: "#22d3ee",
  brightWhite: "#000000",
};

export function TerminalPane({
  pane,
  isActive,
  onFocus,
  onStatusChange,
}: TerminalPaneProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<PaneStatus>("running");
  const initializedRef = useRef(false);

  const updateStatus = useCallback(
    (newStatus: PaneStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // 1. 初回マウント時にTerminalを1回だけ作成する
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.25,
      fontWeight: "400",
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: true,
      drawBoldTextInBrightColors: true,
      scrollback: 10000,
      theme: resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon failed to load, using canvas renderer:", e);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    const setupTerminal = async () => {
      try {
        unlistenData = await ptyBridge.onData(pane.id, (data) => {
          terminal.write(data);
        });
        
        unlistenExit = await ptyBridge.onExit(pane.id, () => {
          updateStatus("exited");
          terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        });

        if (!initializedRef.current) {
          initializedRef.current = true;
          const dims = fitAddon.proposeDimensions();
          await ptyBridge.create({
            id: pane.id,
            cwd: pane.cwd,
            shell: pane.shell,
            rows: dims?.rows ?? 24,
            cols: dims?.cols ?? 80,
          });
        }
        updateStatus("running");

        terminal.onData((data) => ptyBridge.write(pane.id, data));
        terminal.onResize(({ rows, cols }) => ptyBridge.resize(pane.id, rows, cols));

        requestAnimationFrame(() => {
          fitAddon.fit();
          if (isActive) terminal.focus();
        });
      } catch (e) {
        console.error("Terminal setup failed:", e);
        updateStatus("error");
      }
    };

    setupTerminal();

    const observer = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      unlistenData?.();
      unlistenExit?.();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [pane.id]); // resolvedThemeを依存配列から外し、再作成を防ぐ

  // 2. テーマが変更された時、オプションのみを更新する
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
      // 再描画を促す
      terminalRef.current.refresh(0, terminalRef.current.rows - 1);
    }
  }, [resolvedTheme]);

  // 3. アクティブ状態のフォーカス管理
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  const borderStyle = status === "error" 
    ? "border-[var(--color-border-error)] shadow-[0_0_8px_var(--color-glow-error)]"
    : isActive 
      ? "border-[var(--color-border-active)] shadow-[0_0_10px_var(--color-glow-active)]"
      : "border-[var(--color-border-default)]";

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-md border ${borderStyle}`}
      onClick={onFocus}
      style={{
        backgroundColor: isActive 
          ? "var(--color-surface-secondary)" 
          : "var(--color-surface-primary)",
      }}
    >
      <div className="absolute top-1 right-2 z-10 flex items-center gap-2 px-2 py-0.5 rounded-full bg-surface-primary/40 backdrop-blur-md border border-white/5">
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            status === "running"
              ? isActive 
                ? "bg-[#4ade80] shadow-[0_0_8px_#4ade80] animate-pulse" 
                : "bg-[#4ade80]/30"
              : "bg-[#ef4444] shadow-[0_0_8px_#ef4444]"
          }`}
        />
        {isActive && status === "running" && (
          <span className="text-[9px] font-bold text-[#4ade80]/90 uppercase tracking-widest">
            Active
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-full w-full pt-6"
        style={{ background: "transparent" }}
      />
    </div>
  );
}
