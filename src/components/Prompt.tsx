import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, CornerDownLeft, X } from "lucide-react";

interface PromptProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
}

export function Prompt({
  isOpen,
  onClose,
  title,
  placeholder,
  defaultValue = "",
  onSubmit,
}: PromptProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit(value);
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh]">
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className="relative w-[90%] max-w-[600px] overflow-hidden rounded-xl border border-border-dim bg-bg-glass shadow-2xl backdrop-blur-3xl"
            initial={{ opacity: 0, scale: 0.99, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: -5 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
          >
            {/* Header / Title */}
            <div className="px-5 py-3 border-b border-border-dim bg-bg-main/30 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-bold text-accent">
                {title}
              </span>
              <button onClick={onClose} className="text-tx-muted hover:text-tx-primary transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Input Area */}
            <div className="flex items-center gap-4 px-5 py-6">
              <ChevronRight size={18} className="text-tx-muted opacity-50" />
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-[16px] font-medium text-tx-primary outline-none placeholder:text-tx-muted/20"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-6 border-t border-border-dim bg-bg-main/10 px-6 py-3">
              <div className="flex items-center gap-1.5 opacity-60">
                <kbd className="text-[10px] font-mono border border-border-dim px-1.5 rounded bg-bg-surface/50 text-tx-secondary">
                  <CornerDownLeft size={8} />
                </kbd>
                <span className="text-[9px] uppercase tracking-widest font-medium text-tx-muted">Confirm</span>
              </div>
              <div className="flex items-center gap-1.5 opacity-60">
                <kbd className="text-[10px] font-mono border border-border-dim px-1.5 rounded bg-bg-surface/50 text-tx-secondary">Esc</kbd>
                <span className="text-[9px] uppercase tracking-widest font-medium text-tx-muted">Cancel</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
