import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, CornerDownLeft, X } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category?.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
        e.stopPropagation();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) {
          cmd.action();
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  useEffect(() => {
    if (scrollRef.current) {
      const activeEl = scrollRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh]">
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog Container (VSCode-like size & style) */}
          <motion.div
            className="relative w-[90%] max-w-[560px] overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0c1117] shadow-2xl"
            initial={{ opacity: 0, scale: 0.99, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: -5 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
          >
            {/* Search Area */}
            <div className="flex items-center gap-3 border-b border-black/[0.05] dark:border-white/5 px-4 py-2.5">
              <Search size={18} className="text-accent-primary opacity-70" strokeWidth={2} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="コマンドを検索..."
                className="flex-1 bg-transparent text-[14px] font-medium text-text-primary outline-none placeholder:text-text-muted/40"
              />
              <button 
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* List Area */}
            <div
              ref={scrollRef}
              className="max-h-[360px] overflow-y-auto p-1 no-scrollbar"
            >
              {filteredCommands.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-text-muted/40">
                  <p className="text-xs font-medium">結果が見つかりません</p>
                </div>
              ) : (
                filteredCommands.map((cmd, index) => {
                  const isActive = index === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      className={`group flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5 transition-all duration-75 ${
                        isActive 
                          ? "bg-accent-primary text-white" 
                          : "text-text-secondary hover:bg-black/[0.04] dark:hover:bg-white/5"
                      }`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight 
                          size={14} 
                          className={`transition-colors ${isActive ? "text-white" : "text-text-muted/50"}`} 
                          strokeWidth={2}
                        />
                        <div className="flex flex-col">
                          <span className="text-[13px] font-medium tracking-tight">
                            {cmd.label}
                          </span>
                          {cmd.category && !isActive && (
                            <span className="text-[9px] uppercase tracking-wider opacity-50">
                              {cmd.category}
                            </span>
                          )}
                        </div>
                      </div>

                      {cmd.shortcut && (
                        <div className={`text-[10px] ml-4 font-mono opacity-80 ${isActive ? "text-white" : "text-text-muted"}`}>
                          {cmd.shortcut}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-6 border-t border-black/[0.05] dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-2">
              <div className="flex items-center gap-1.5 grayscale opacity-50">
                <kbd className="text-[10px] font-mono border border-black/10 dark:border-white/10 px-1 rounded">↑↓</kbd>
                <span className="text-[9px] uppercase tracking-widest font-medium">Move</span>
              </div>
              <div className="flex items-center gap-1.5 grayscale opacity-50">
                <kbd className="text-[10px] font-mono border border-black/10 dark:border-white/10 px-1 rounded">
                  <CornerDownLeft size={8} />
                </kbd>
                <span className="text-[9px] uppercase tracking-widest font-medium">Select</span>
              </div>
              <div className="flex items-center gap-1.5 grayscale opacity-50">
                <kbd className="text-[10px] font-mono border border-black/10 dark:border-white/10 px-1 rounded">Esc</kbd>
                <span className="text-[9px] uppercase tracking-widest font-medium">Close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
