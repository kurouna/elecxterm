import { motion, AnimatePresence } from "framer-motion";
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
    <div className="flex items-center h-8 bg-surface-primary/40 border-b border-border-default/10 px-2 gap-1 overflow-x-auto no-scrollbar">
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => (
          <motion.div
            key={tab.id}
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => onTabSelect(tab.id)}
            className={`group relative flex items-center h-7 px-3 min-w-[100px] max-w-[200px] rounded-t-md cursor-pointer transition-all duration-200 select-none ${
              activeTabId === tab.id
                ? "bg-surface-secondary/80 text-text-primary border-t border-x border-border-default/20 shadow-[0_-2px_10px_rgba(0,0,0,0.2)]"
                : "text-text-muted hover:bg-white/5 hover:text-text-secondary"
            }`}
          >
            {/* アクティブ時のインジケーター（上線） */}
            {activeTabId === tab.id && (
              <motion.div
                layoutId="activeTabOutline"
                className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary shadow-[0_0_8px_var(--color-glow-active)]"
              />
            )}

            <span className="text-[11px] font-medium truncate flex-1">
              {tab.name}
            </span>

            {/* 閉じるボタン */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="ml-2 w-4 h-4 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
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
        ))}
      </AnimatePresence>

      {/* 新規タブボタン */}
      <button
        onClick={onTabAdd}
        className="ml-1 w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:bg-white/5 hover:text-accent-primary transition-colors"
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
