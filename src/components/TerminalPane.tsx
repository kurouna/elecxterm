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
  foreground: "#000000",
  cursor: "#2563eb",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(37, 99, 235, 0.2)",
  selectionForeground: "#000000",
  black: "#000000",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#f8fafc",
  brightBlack: "#64748b",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
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

  useEffect(() => {
    if (!containerRef.current) return;

    // Build terminal with requested fonts and BOLD to fix blur on Windows
    const terminal = new Terminal({
      fontFamily: '"Cascadia Mono", "JetBrains Mono", "Noto Sans JP", "BIZ UDGothic", "Meiryo", "Yu Gothic", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.5,
      fontWeight: '500', // 物理的に線を太くしてかすれを解消
      fontWeightBold: 'bold',
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: true,
      scrollback: 10000,
      theme: resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // mount after setup
    terminal.open(containerRef.current);

    // load WebGL addon to fix blurriness
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon failed to load:", e);
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

    const setupTerminal = async () => {
      try {
        unlistenData = await ptyBridge.onData(pane.id, (data) => terminal.write(data));
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
      try { fitAddon.fit(); } catch { }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      unlistenData?.();
      unlistenExit?.();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [pane.id]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME;
      terminalRef.current.refresh(0, terminalRef.current.rows - 1);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  const borderClass = status === "error"
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
      <div className="absolute top-1 right-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg-main/30 backdrop-blur-md border border-tx-primary/5">
        <div
          className={`h-1.5 w-1.5 rounded-full ${status === "running"
            ? "bg-[#22c55e]"
            : "bg-[#ef4444]"
            } ${isActive && status === "running" ? "shadow-[0_0_8px_#22c55e] animate-pulse" : ""}`}
        />
        {isActive && status === "running" && (
          <span className="text-[8px] font-bold text-[#22c55e] uppercase tracking-widest leading-none" style={{ marginTop: '1px' }}>
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
