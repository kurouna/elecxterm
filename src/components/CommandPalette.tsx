import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CommandItem } from "../types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // フィルタリング（あいまい検索）
  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery) ||
        cmd.category?.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);

  // オープン時にフォーカスとリセット
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // 選択インデックスの正規化
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  // 選択中のアイテムをスクロール表示
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* オーバーレイ */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* パレット本体 */}
          <motion.div
            className="fixed top-[15%] left-1/2 z-50 w-full max-w-xl -translate-x-1/2"
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{
              duration: 0.2,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            <div className="glass overflow-hidden rounded-xl border border-border-default shadow-2xl shadow-accent-primary/10">
              {/* 検索入力 */}
              <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="flex-shrink-0 text-text-muted"
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M16 16L21 21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="コマンドを検索..."
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
                />
                <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  ESC
                </kbd>
              </div>

              {/* コマンド一覧 */}
              <div
                ref={listRef}
                className="max-h-72 overflow-y-auto py-1"
              >
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-text-muted">
                    一致するコマンドが見つかりません
                  </div>
                ) : (
                  filteredCommands.map((cmd, index) => (
                    <button
                      key={cmd.id}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors duration-75 ${
                        index === selectedIndex
                          ? "bg-accent-primary/15 text-text-primary"
                          : "text-text-secondary hover:bg-white/[0.04]"
                      }`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {cmd.label}
                        </span>
                        {cmd.description && (
                          <span className="text-xs text-text-muted">
                            {cmd.description}
                          </span>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="ml-4 flex-shrink-0 rounded bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-text-muted">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* フッター */}
              <div className="flex items-center gap-4 border-t border-border-default px-4 py-2">
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <kbd className="rounded bg-white/[0.06] px-1 py-0.5">↑↓</kbd>
                  <span>移動</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <kbd className="rounded bg-white/[0.06] px-1 py-0.5">Enter</kbd>
                  <span>実行</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
