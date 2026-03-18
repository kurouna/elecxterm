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
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[8vh]">
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* VSCode-like Compact Dialog */}
          <motion.div
            className="relative w-[90%] max-w-[500px] overflow-hidden rounded-lg border border-border-dim bg-bg-glass shadow-2xl backdrop-blur-3xl"
            initial={{ opacity: 0, scale: 0.99, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: -5 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
          >
            {/* Search Area */}
            <div className="flex items-center gap-2.5 border-b border-border-dim px-4 py-2.5 bg-bg-main/50">
              <Search size={16} className="text-accent opacity-80" strokeWidth={2.5} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands..."
                className="flex-1 bg-transparent text-[13px] font-medium text-tx-primary outline-none placeholder:text-tx-muted/30"
              />
              <button onClick={onClose} className="text-tx-muted hover:text-tx-primary transition-colors p-1">
                <X size={14} />
              </button>
            </div>

            {/* List Area */}
            <div 
              ref={scrollRef} 
              className="max-h-[400px] overflow-y-auto p-1.5 no-scrollbar"
            >
              {filteredCommands.length === 0 ? (
                <div className="py-8 text-center text-tx-muted opacity-50">
                  <p className="text-xs font-medium">No results found</p>
                </div>
              ) : (
                filteredCommands.map((cmd, index) => {
                  const isActive = index === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      className={`group flex items-center h-[36px] rounded transition-all duration-75 mb-0.5 mx-0.5 px-3 ${
                        isActive 
                          ? "bg-accent text-white shadow-sm" 
                          : "text-tx-secondary hover:bg-accent-dim"
                      }`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {/* Inner wrapper to handle layout and padding robustly */}
                      <div className="flex items-center w-full pr-2">
                        {/* Label Side */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <ChevronRight 
                            size={12} 
                            className={`flex-shrink-0 transition-colors ${isActive ? "text-white" : "text-tx-muted/50"}`} 
                            strokeWidth={2}
                          />
                          <div className="flex items-baseline gap-3 truncate">
                            <span className="text-[12.5px] font-medium tracking-tight truncate leading-none">
                              {cmd.label}
                            </span>
                            {!isActive && (
                              <span className="text-[9px] uppercase tracking-wider text-tx-muted/40 leading-none flex-shrink-0">
                                {cmd.category}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Shortcut Side */}
                        {cmd.shortcut && (
                          <div className={`flex-shrink-0 font-mono text-[10px] ml-4 ${isActive ? "text-white" : "text-tx-muted/50"}`}>
                            {cmd.shortcut}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-6 border-t border-border-dim bg-bg-main/30 px-4 py-1.5 opacity-60">
              <div className="flex items-center gap-1.5 ">
                <kbd className="text-[9px] font-mono border border-border-dim px-1 rounded bg-bg-surface/50 text-tx-secondary">↑↓</kbd>
                <span className="text-[8px] uppercase tracking-widest font-medium text-tx-muted">Move</span>
              </div>
              <div className="flex items-center gap-1.5 ">
                <kbd className="text-[9px] font-mono border border-border-dim px-1 rounded bg-bg-surface/50 text-tx-secondary">
                  <CornerDownLeft size={7} />
                </kbd>
                <span className="text-[8px] uppercase tracking-widest font-medium text-tx-muted">Select</span>
              </div>
              <div className="flex items-center gap-1.5 ">
                <kbd className="text-[9px] font-mono border border-border-dim px-1 rounded bg-bg-surface/50 text-tx-secondary">Esc</kbd>
                <span className="text-[8px] uppercase tracking-widest font-medium text-tx-muted">Close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
