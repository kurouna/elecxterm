import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Edit3, Trash2, X } from "lucide-react";
import { Tab } from "../types";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabRename: (id: string, newName: string) => void;
  onTabAdd: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  tabId: string;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabRename,
  onTabAdd,
}: TabBarProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const startRename = () => {
    if (!menu) return;
    const tab = tabs.find(t => t.id === menu.tabId);
    if (tab) {
      setRenameId(tab.id);
      setTempName(tab.name);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    setMenu(null);
  };

  const submitRename = () => {
    if (renameId && tempName.trim() !== "") {
      onTabRename(renameId, tempName.trim());
    }
    setRenameId(null);
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    
    const activeElement = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTabId]);

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="flex items-center h-9 bg-bg-main border-b border-border-dim px-3 transition-colors duration-300">
      <div 
        ref={scrollRef} 
        onWheel={handleWheel}
        className="flex-1 flex items-center h-full gap-1.5 overflow-x-auto no-scrollbar"
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const isRenaming = renameId === tab.id;

            return (
              <motion.div
                key={tab.id}
                data-tab-id={tab.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => !isRenaming && onTabSelect(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                className={`group relative flex-shrink-0 flex items-center h-[30px] px-3 min-w-[124px] max-w-[220px] rounded-t-md cursor-pointer transition-all duration-200 select-none outline-none ${
                  isActive
                    ? "bg-bg-surface text-tx-primary"
                    : "bg-transparent text-tx-muted hover:bg-bg-elevated/40 hover:text-tx-secondary"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute top-0 left-0 right-0 h-[1.5px] bg-accent"
                  />
                )}

                <div className="flex items-center gap-2 flex-1 truncate">
                  <Terminal 
                    size={11} 
                    className={`flex-shrink-0 transition-colors ${
                      isActive ? "text-accent" : "text-tx-muted/40"
                    }`} 
                    strokeWidth={2.5}
                  />
                  
                  {isRenaming ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename();
                        if (e.key === "Escape") setRenameId(null);
                      }}
                      onBlur={submitRename}
                      className="w-full bg-accent-dim/10 text-[10px] font-normal text-tx-primary outline-none border-b border-accent px-1 py-0"
                    />
                  ) : (
                    <span className="text-[10px] tracking-tight truncate font-normal font-sans">
                      {tab.name}
                    </span>
                  )}
                </div>

                {!isRenaming && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.id);
                    }}
                    className={`ml-1 w-4 h-4 flex items-center justify-center rounded-sm transition-all ${
                      isActive ? "opacity-40 hover:opacity-100 hover:bg-tx-primary/10" : "opacity-0 group-hover:opacity-40 hover:bg-tx-primary/5"
                    }`}
                  >
                    <X size={10} strokeWidth={2} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <button
        onClick={onTabAdd}
        className="flex-shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded-md text-tx-muted/60 hover:bg-bg-elevated/60 hover:text-accent transition-all duration-200"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Context Menu */}
      <AnimatePresence>
        {menu && (
          <>
            <div 
              className="fixed inset-0 z-[10000]" 
              onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
              onClick={() => setMenu(null)}
            />
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.98, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -2 }}
              transition={{ duration: 0.08 }}
              style={{ top: menu.y, left: menu.x }}
              className="fixed z-[10001] w-44 py-1.5 bg-bg-glass border border-border-dim rounded shadow-lg backdrop-blur-2xl overflow-hidden"
            >
              <button
                onClick={startRename}
                className="w-full flex items-center gap-3 px-3 py-1.5 text-[11px] font-normal text-tx-secondary hover:bg-accent hover:text-white transition-colors"
              >
                <Edit3 size={11} className="opacity-60" />
                <span>Rename Tab</span>
              </button>
              <div className="mx-2 my-1 border-t border-border-dim/20" />
              <button
                onClick={() => { onTabClose(menu.tabId); setMenu(null); }}
                className="w-full flex items-center gap-3 px-3 py-1.5 text-[11px] font-normal text-tx-secondary hover:bg-red-500 hover:text-white transition-colors"
              >
                <Trash2 size={11} className="opacity-60" />
                <span>Close Tab</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
