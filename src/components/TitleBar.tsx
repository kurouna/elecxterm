import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface TitleBarProps {
  sessionName?: string;
}

export function TitleBar({ sessionName = "elecxterm" }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch {
        // ウィンドウAPIが利用できない場合は無視
      }
    };
    checkMaximized();

    // ウィンドウリサイズ時に最大化状態を再チェック
    const unlisten = appWindow.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => appWindow.close();

  return (
    <div
      className="titlebar-drag glass flex h-9 w-full items-center justify-between border-b border-border-default select-none"
      onDoubleClick={handleMaximize}
    >
      {/* 左側: ロゴ + セッション名 */}
      <div className="flex items-center gap-2.5 pl-3.5">
        {/* ロゴアイコン */}
        {/* ロゴアイコン */}
        <div className="flex items-center gap-1.5 focus-ring">
          <img
            src="/app-icon.svg"
            alt="logo"
            className="w-5 h-5 object-contain"
          />
          <span className="text-[11px] font-bold tracking-tight text-text-primary opacity-90">
            {sessionName}
          </span>
        </div>
      </div>

      {/* 右側: ウィンドウコントロール */}
      <div className="titlebar-no-drag flex h-full items-center">
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center transition-colors duration-150 hover:bg-white/[0.06]"
          aria-label="最小化"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor" className="text-text-secondary">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* 最大化 / 復元 */}
        <button
          onClick={handleMaximize}
          className="flex h-full w-11 items-center justify-center transition-colors duration-150 hover:bg-white/[0.06]"
          aria-label={isMaximized ? "復元" : "最大化"}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-text-secondary">
              <rect x="0" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2 2V1C2 0.448 2.448 0 3 0H9C9.552 0 10 0.448 10 1V7C10 7.552 9.552 8 9 8H8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-text-secondary">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>

        {/* 閉じる */}
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center transition-colors duration-200 hover:bg-red-500/80 hover:text-white"
          aria-label="閉じる"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-text-secondary">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
