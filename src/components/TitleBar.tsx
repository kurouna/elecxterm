import { getCurrentWindow } from "@tauri-apps/api/window";
import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Command, LayoutGrid, Moon, Settings, Sun } from "lucide-react";
import { KEYS } from "../keymap";
import { IconButton } from "./ui";

interface TitleBarProps {
  /** タブ列（ウィンドウ上端に統合して縦方向の領域を節約する） */
  children: ReactNode;
  resolvedTheme: "dark" | "light";
  onToggleTheme: (origin: { x: number; y: number }) => void;
  onOverview: () => void;
  onPalette: () => void;
  onSettings: () => void;
}

/**
 * フレームレスウィンドウのタイトルバー。ロゴ・タブ・クイック操作・ウィンドウ操作を 1 行にまとめる。
 * ドラッグ移動は CSS の app-region と Tauri の data-tauri-drag-region の両方で指定し、
 * どちらの経路でも動くようにする（最大化のダブルクリックも OS / Tauri 側が処理する）。
 */
export function TitleBar({ children, resolvedTheme, onToggleTheme, onOverview, onPalette, onSettings }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const checkMaximized = () => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    };
    checkMaximized();
    const unlisten = appWindow.onResized(checkMaximized);

    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const appWindow = getCurrentWindow();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <div
      data-tauri-drag-region
      data-window-inactive={windowFocused ? undefined : ""}
      className="titlebar titlebar-drag flex h-10 w-full shrink-0 select-none items-stretch bg-bg-chrome"
    >
      <div data-tauri-drag-region className="titlebar-dimmable flex shrink-0 items-center pl-3 pr-2">
        <img src="/app-icon.svg" alt="" className="pointer-events-none h-[18px] w-[18px]" />
      </div>

      <div data-tauri-drag-region className="titlebar-dimmable flex min-w-0 flex-1">
        {children}
      </div>

      {/* タブがいくつ増えても必ず残る、ウィンドウ移動用の余白（タブ列の空きもドラッグ領域） */}
      <div data-tauri-drag-region className="w-16 shrink-0" />

      <div className="titlebar-no-drag titlebar-dimmable flex items-center gap-0.5 pr-2">
        <IconButton label="Pane overview" shortcut={KEYS.overview} onClick={onOverview}>
          <LayoutGrid size={15} />
        </IconButton>
        <IconButton label="Command palette" shortcut={KEYS.palette} onClick={onPalette}>
          <Command size={15} />
        </IconButton>
        <IconButton
          label={`Switch to ${nextTheme} theme`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onToggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }}
        >
          {/* 太陽と月がくるりと入れ替わる */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={resolvedTheme}
              className="flex"
              initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {resolvedTheme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            </motion.span>
          </AnimatePresence>
        </IconButton>
        <IconButton label="Settings" shortcut={KEYS.settings} onClick={onSettings}>
          <Settings size={15} />
        </IconButton>
      </div>

      <div className="titlebar-no-drag flex h-full items-stretch">
        <WindowButton label="Minimize" onClick={() => appWindow.minimize()}>
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </WindowButton>
        <WindowButton label={isMaximized ? "Restore" : "Maximize"} onClick={() => appWindow.toggleMaximize()}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.1" />
              <path d="M2 2V1C2 0.448 2.448 0 3 0H9C9.552 0 10 0.448 10 1V7C10 7.552 9.552 8 9 8H8" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          )}
        </WindowButton>
        <WindowButton label="Close" danger onClick={() => appWindow.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex w-[46px] items-center justify-center text-tx-secondary transition-colors duration-100 ${
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-tx-primary/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}
