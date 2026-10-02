import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { Bell, ChevronDown, LayoutGrid, Maximize2, Pencil, Plus, RotateCcw, Terminal, X, XSquare } from "lucide-react";
import { Tab, TabColor, TAB_COLORS } from "../types";
import { colorSwatch, tabAccent } from "../tabColors";
import { useAllPaneStates } from "../hooks/usePaneState";
import { collectPaneIds, tabTitle } from "../services/paneInfo";
import { PaneVolatileState } from "../services/PaneStateStore";
import { KEYS } from "../keymap";
import { IconButton, Kbd } from "./ui";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onTabColor: (id: string, color: TabColor | undefined) => void;
  onTabRename: (id: string, newName: string) => void;
  onTabReorder: (tabs: Tab[]) => void;
  onTabAdd: (shell?: string) => void;
}

interface MenuState {
  x: number;
  y: number;
  tabId?: string;
  kind: "tab" | "new";
}

/** タブに属するペインの状態をまとめる（未読出力・ベル・実行中の数） */
function summarize(tab: Tab, states: Record<string, PaneVolatileState>) {
  const ids = collectPaneIds(tab.layout);
  let activity = false;
  let bell = false;
  let failed = false;
  for (const id of ids) {
    const s = states[id];
    if (!s) continue;
    activity ||= s.activity;
    bell ||= s.bell;
    failed ||= s.status === "error";
  }
  return { count: ids.length, activity, bell, failed };
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onCloseOthers,
  onTabColor,
  onTabRename,
  onTabReorder,
  onTabAdd,
}: TabBarProps) {
  const states = useAllPaneStates();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Escape でキャンセルした直後の blur で確定してしまわないためのフラグ
  const cancelRenameRef = useRef(false);

  const startRename = (tab: Tab, states: Record<string, PaneVolatileState>) => {
    cancelRenameRef.current = false;
    setRenameId(tab.id);
    setTempName(tabTitle(tab, states));
    setMenu(null);
  };

  const finishRename = () => {
    if (renameId && !cancelRenameRef.current && tempName.trim()) onTabRename(renameId, tempName);
    cancelRenameRef.current = false;
    setRenameId(null);
  };

  // アクティブタブを常に見える位置へ
  useEffect(() => {
    scrollRef.current
      ?.querySelector(`[data-tab-id="${activeTabId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  // メニューが画面外にはみ出さないよう位置を補正する
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - rect.width - 8);
    const y = Math.min(menu.y, window.innerHeight - rect.height - 8);
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu]);

  // Esc でメニューを閉じる
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu]);

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) scrollRef.current.scrollLeft += e.deltaY + e.deltaX;
  };

  const menuTab = menu?.tabId ? tabs.find((t) => t.id === menu.tabId) : undefined;

  return (
    <div data-tauri-drag-region className="flex h-full min-w-0 flex-1 items-end">
      <Reorder.Group
        as="div"
        axis="x"
        values={tabs}
        onReorder={onTabReorder}
        ref={scrollRef}
        onWheel={handleWheel}
        layoutScroll
        role="tablist"
        aria-label="Tabs"
        data-tauri-drag-region
        className="no-scrollbar flex h-full min-w-0 items-end gap-0.5 overflow-x-auto"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {tabs.map((tab, index) => {
            const isActive = activeTabId === tab.id;
            const isRenaming = renameId === tab.id;
            const info = summarize(tab, states);
            const title = tabTitle(tab, states);

            return (
              <Reorder.Item
                as="div"
                value={tab}
                key={tab.id}
                data-tab-id={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                layout="position"
                dragListener={!isRenaming}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
                transition={{ type: "spring", damping: 32, stiffness: 520 }}
                whileDrag={{ zIndex: 50, cursor: "grabbing" }}
                onPointerDown={(e: React.PointerEvent) => {
                  if (e.button === 0 && !isRenaming) onTabSelect(tab.id);
                }}
                onAuxClick={(e: React.MouseEvent) => {
                  // 中クリックで閉じる（ブラウザ・Windows Terminal と同じ）
                  if (e.button === 1) {
                    e.preventDefault();
                    onTabClose(tab.id);
                  }
                }}
                onDoubleClick={() => startRename(tab, states)}
                onContextMenu={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, kind: "tab" });
                }}
                title={`${title}${info.count > 1 ? ` · ${info.count} panes` : ""}${index < 9 ? ` · Ctrl+Alt+${index + 1}` : ""}`}
                className={`titlebar-no-drag group relative flex h-[32px] min-w-[120px] max-w-[220px] flex-shrink-0 select-none items-center gap-2 rounded-t-lg px-3 text-[12px] outline-none ${
                  isActive
                    ? "bg-bg-main text-tx-primary"
                    : "text-tx-muted hover:bg-tx-primary/[0.05] hover:text-tx-secondary"
                }`}
              >
                {isActive ? (
                  <motion.span
                    layoutId="active-tab-indicator"
                    className="absolute inset-x-3 top-0 h-[2px] rounded-b-full"
                    style={{ background: tab.color ? tabAccent(tab, index) : "var(--accent)" }}
                    transition={{ type: "spring", damping: 34, stiffness: 520 }}
                  />
                ) : (
                  tab.color && (
                    <span
                      className="absolute inset-x-3 top-0 h-[2px] rounded-b-full opacity-60"
                      style={{ background: tabAccent(tab, index) }}
                    />
                  )
                )}

                {/* 状態アイコン: ベル > 未読出力 > 通常 */}
                {info.bell && !isActive ? (
                  <Bell size={12} className="shrink-0 text-warning" aria-label="Bell" />
                ) : info.activity && !isActive ? (
                  <span className="relative flex h-3 w-3 shrink-0 items-center justify-center" aria-label="New output">
                    <span className="absolute h-2 w-2 animate-ping rounded-full bg-accent/50" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                ) : (
                  <Terminal
                    size={12}
                    strokeWidth={2.4}
                    className={`shrink-0 ${info.failed ? "text-danger" : isActive ? "text-accent" : "text-tx-muted/70"}`}
                  />
                )}

                {isRenaming ? (
                  <input
                    autoFocus
                    value={tempName}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setTempName(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      // IME 変換確定の Enter で確定させない（日本語入力での誤確定防止）
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        cancelRenameRef.current = true;
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={finishRename}
                    aria-label="Tab name"
                    className="min-w-0 flex-1 rounded bg-bg-surface px-1 text-[12px] text-tx-primary outline-none ring-1 ring-accent"
                  />
                ) : (
                  <span className={`min-w-0 flex-1 truncate ${tab.renamed ? "font-medium" : ""}`}>{title}</span>
                )}

                {!isRenaming && tab.zoomed && (
                  <Maximize2 size={11} className="shrink-0 text-accent" aria-label="Zoomed" />
                )}
                {!isRenaming && info.count > 1 && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-tx-primary/[0.06] px-1 font-mono text-[10px] text-tx-muted">
                    <LayoutGrid size={9} />
                    {info.count}
                  </span>
                )}

                {!isRenaming && (
                  <button
                    type="button"
                    aria-label={`Close ${title}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.id);
                    }}
                    className={`-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-opacity hover:bg-tx-primary/10 hover:text-tx-primary ${
                      isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60"
                    }`}
                  >
                    <X size={12} />
                  </button>
                )}
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>

      {/* 新規タブ（+）とシェル選択（▾）。Windows Terminal と同じ分割ボタン */}
      <div className="titlebar-no-drag mb-[3px] ml-1 flex shrink-0 items-center rounded-md">
        <IconButton label="New tab" shortcut={KEYS.newTab} onClick={() => onTabAdd()}>
          <Plus size={15} />
        </IconButton>
        <IconButton
          label="New tab with shell…"
          className="!w-5"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4, kind: "new" });
          }}
        >
          <ChevronDown size={13} />
        </IconButton>
      </div>

      <AnimatePresence>
        {menu && (
          <>
            <div
              className="fixed inset-0 z-[900]"
              onPointerDown={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <motion.div
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, scale: 0.97, y: -3 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -3, transition: { duration: 0.08 } }}
              transition={{ duration: 0.1 }}
              style={{ top: menu.y, left: menu.x }}
              className="titlebar-no-drag fixed z-[901] w-56 overflow-hidden rounded-lg border border-border-strong bg-bg-glass p-1 shadow-[var(--shadow-lg)] backdrop-blur-2xl"
            >
              {menu.kind === "new" ? (
                <>
                  <MenuItem icon={<Terminal size={13} />} label="Command Prompt" hint={KEYS.newTab} onClick={() => { onTabAdd("cmd.exe"); setMenu(null); }} />
                  <MenuItem icon={<Terminal size={13} className="text-info" />} label="PowerShell" onClick={() => { onTabAdd("pwsh.exe"); setMenu(null); }} />
                </>
              ) : (
                menuTab && (
                  <>
                    <MenuItem icon={<Pencil size={13} />} label="Rename" hint="Double-click" onClick={() => startRename(menuTab, states)} />
                    {menuTab.renamed && (
                      <MenuItem
                        icon={<RotateCcw size={13} />}
                        label="Use automatic name"
                        onClick={() => { onTabRename(menuTab.id, ""); setMenu(null); }}
                      />
                    )}
                    <div className="mx-1 my-1 border-t border-border-dim" />
                    <div className="px-2 pb-1 pt-0.5 text-[10.5px] text-tx-muted">Tab color</div>
                    <div className="flex items-center gap-1.5 px-2 pb-1.5">
                      <button
                        type="button"
                        aria-label="Automatic color"
                        title="Automatic"
                        onClick={() => { onTabColor(menuTab.id, undefined); setMenu(null); }}
                        className={`flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-tx-muted ${
                          !menuTab.color ? "ring-2 ring-accent ring-offset-1 ring-offset-bg-elevated" : ""
                        }`}
                      >
                        <X size={9} />
                      </button>
                      {TAB_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`${color} tab color`}
                          title={color}
                          onClick={() => { onTabColor(menuTab.id, color); setMenu(null); }}
                          className={`h-4 w-4 rounded-full transition-transform hover:scale-125 ${
                            menuTab.color === color ? "ring-2 ring-tx-primary ring-offset-1 ring-offset-bg-elevated" : ""
                          }`}
                          style={{ background: colorSwatch(color) }}
                        />
                      ))}
                    </div>
                    <div className="mx-1 my-1 border-t border-border-dim" />
                    <MenuItem
                      icon={<XSquare size={13} />}
                      label="Close other tabs"
                      disabled={tabs.length < 2}
                      onClick={() => { onCloseOthers(menuTab.id); setMenu(null); }}
                    />
                    <MenuItem
                      icon={<X size={13} />}
                      label="Close tab"
                      hint="Middle-click"
                      danger
                      onClick={() => { onTabClose(menuTab.id); setMenu(null); }}
                    />
                  </>
                )
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] text-tx-secondary transition-colors disabled:opacity-40 ${
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-accent hover:text-accent-contrast"
      }`}
    >
      <span className="opacity-70">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && (hint.includes("+") ? <Kbd keys={hint} className="opacity-60" /> : <span className="text-[10.5px] opacity-50">{hint}</span>)}
    </button>
  );
}
