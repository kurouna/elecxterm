import { motion, AnimatePresence } from "framer-motion";
import { Terminal } from "lucide-react";
import { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabAdd: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabAdd,
}: TabBarProps) {
  return (
    <div className="flex items-center h-9 bg-surface-primary border-b border-[var(--color-border-default)] px-3 gap-1.5 overflow-x-auto no-scrollbar">
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => onTabSelect(tab.id)}
              className={`group relative flex items-center h-[30px] px-3 min-w-[120px] max-w-[220px] rounded-t-md cursor-pointer transition-all duration-200 select-none outline-none focus:outline-none ${
                isActive
                  ? "bg-surface-secondary text-text-primary shadow-[0_-1px_0_var(--color-border-active)]"
                  : "bg-transparent text-text-muted hover:bg-surface-elevated hover:text-text-secondary"
              }`}
            >
              {/* アクティブ時のインジケーター */}
              {isActive && (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--color-accent-primary)] shadow-[0_0_8px_var(--color-glow-active)]"
                />
              )}

              <div className="flex items-center gap-2 flex-1 truncate">
                <Terminal 
                  size={12} 
                  className={`flex-shrink-0 transition-colors ${
                    isActive ? "text-accent-primary" : "text-text-muted opacity-50"
                  }`} 
                />
                <span className="text-[10px] tracking-tight truncate">
                  {tab.name}
                </span>
              </div>

              {/* 閉じるボタン */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className={`ml-1 w-4.5 h-4.5 flex items-center justify-center rounded-sm transition-all ${
                  isActive ? "opacity-60 hover:opacity-100 hover:bg-white/10" : "opacity-0 group-hover:opacity-40 hover:bg-white/5"
                }`}
              >
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1 1L9 9M9 1L1 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* 新規タブボタン */}
      <button
        onClick={onTabAdd}
        className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-accent-primary transition-all duration-200"
        title="New Tab (^⇧T)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5V19M5 12H19"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
