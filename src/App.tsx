import { useCallback, useEffect, useMemo, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { SplitLayout } from "./components/SplitLayout";
import { CommandPalette } from "./components/CommandPalette";
import { useLayout } from "./hooks/useLayout";
import { CommandItem, PaneStatus } from "./types";

function App() {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    layout,
    activePane,
    setActivePane,
    splitPane,
    closePane,
    updateRatio,
    nextPane,
    prevPane,
    firstPane,
    lastPane,
  } = useLayout();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paneStatuses, setPaneStatuses] = useState<Record<string, PaneStatus>>(
    {}
  );

  // ペインステータス変更ハンドラ
  const handlePaneStatusChange = useCallback(
    (id: string, status: PaneStatus) => {
      setPaneStatuses((prev) => ({ ...prev, [id]: status }));
    },
    []
  );

  /** タブを次へ */
  const nextTab = useCallback(() => {
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTabId(tabs[nextIndex].id);
    }
  }, [tabs, activeTabId, setActiveTabId]);

  /** タブを前へ */
  const prevTab = useCallback(() => {
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setActiveTabId(tabs[prevIndex].id);
    }
  }, [tabs, activeTabId, setActiveTabId]);

  // コマンドパレットのコマンド一覧
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "new-tab",
        label: "新しいタブを作成",
        description: "新しいセッションを開始します",
        shortcut: "Ctrl+Shift+T",
        category: "全般",
        action: () => addTab(),
      },
      {
        id: "split-h-cmd",
        label: "画面を縦に分割 (CMD)",
        description: "Command Prompt を右側に開きます",
        shortcut: "Ctrl+Shift+D",
        category: "レイアウト",
        action: () => {
          if (activePane) splitPane(activePane, "horizontal", { shell: "cmd.exe" });
        },
      },
      {
        id: "split-v-cmd",
        label: "画面を横に分割 (CMD)",
        description: "Command Prompt を下側に開きます",
        shortcut: "Ctrl+Shift+E",
        category: "レイアウト",
        action: () => {
          if (activePane) splitPane(activePane, "vertical", { shell: "cmd.exe" });
        },
      },
      {
        id: "close-pane",
        label: "ペインを閉じる (Close)",
        description: "アクティブなペインを閉じます",
        shortcut: "Ctrl+Shift+W",
        category: "レイアウト",
        action: () => {
          if (activePane) closePane(activePane);
        },
      },
      {
        id: "next-tab",
        label: "次のタブへ移動",
        shortcut: "Ctrl+Shift+→",
        category: "全般",
        action: () => nextTab(),
      },
      {
        id: "prev-tab",
        label: "前のタブへ移動",
        shortcut: "Ctrl+Shift+←",
        category: "全般",
        action: () => prevTab(),
      },
    ],
    [activePane, splitPane, closePane, addTab, nextTab, prevTab]
  );

  // グローバルキーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // コマンドパレット (Ctrl+Shift+K)
      if (e.ctrlKey && e.shiftKey && e.key === "K") {
        e.preventDefault();
        e.stopPropagation();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // 新しいタブ (Ctrl+Shift+T)
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        addTab();
        return;
      }

      // タブ切り替え: 次へ (Ctrl+Shift+→)
      if (e.ctrlKey && e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        nextTab();
        return;
      }

      // タブ切り替え: 前へ (Ctrl+Shift+←)
      if (e.ctrlKey && e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        prevTab();
        return;
      }

      // シェル移動: 前へ (Ctrl+Shift+P)
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        prevPane();
        return;
      }

      // シェル移動: 次へ (Ctrl+Shift+N)
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        nextPane();
        return;
      }

      // シェル移動: 先頭へ (Ctrl+Shift+<)
      if (e.ctrlKey && e.shiftKey && (e.key === "<" || e.key === ",")) {
        e.preventDefault();
        firstPane();
        return;
      }

      // シェル移動: 最後へ (Ctrl+Shift+>)
      if (e.ctrlKey && e.shiftKey && (e.key === ">" || e.key === ".")) {
        e.preventDefault();
        lastPane();
        return;
      }

      // 縦分割 (Ctrl+Shift+D)
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        if (activePane) splitPane(activePane, "horizontal");
        return;
      }

      // 横分割 (Ctrl+Shift+E)
      if (e.ctrlKey && e.shiftKey && e.key === "E") {
        e.preventDefault();
        if (activePane) splitPane(activePane, "vertical");
        return;
      }

      // ペインを閉じる (Ctrl+Shift+W)
      if (e.ctrlKey && e.shiftKey && e.key === "W") {
        e.preventDefault();
        if (activePane) closePane(activePane);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePane, splitPane, closePane, addTab, nextTab, prevTab, nextPane, prevPane, firstPane, lastPane]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-lg bg-surface-primary">
      {/* カスタムタイトルバー */}
      <TitleBar sessionName="elecxterm" />

      {/* タブバー */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
        onTabAdd={() => addTab()}
      />

      {/* メインコンテンツエリア */}
      <div className="flex-1 overflow-hidden p-0.5">
        {layout && (
          <SplitLayout
            key={activeTabId} // タブ切り替え時にリマウント
            node={layout}
            activePane={activePane}
            onPaneActivate={setActivePane}
            onPaneStatusChange={handlePaneStatusChange}
            onRatioChange={(path, ratios) => {
              updateRatio(path, ratios);
            }}
          />
        )}
      </div>

      {/* ステータスバー */}
      <div className="h-7 flex-shrink-0 bg-surface-primary/95 flex items-center justify-between px-3 text-[9px] text-text-muted border-t border-border-default/10 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 opacity-80">
            <div className="h-1.5 w-1.5 rounded-full bg-accent-emerald shadow-[0_0_5px_rgba(52,211,153,0.3)] animate-pulse" />
            <span className="font-semibold text-text-secondary">{Object.values(paneStatuses).filter((s) => s === "running").length}</span> RUNNING
          </span>
          <span className="text-[8px] opacity-40">|</span>
          <span className="opacity-80 uppercase tracking-tighter">Tab: {tabs.findIndex(t => t.id === activeTabId) + 1} / {tabs.length}</span>
        </div>

        <div className="flex items-center gap-6 uppercase tracking-widest font-bold">
          <div className="flex gap-4 border-r border-border-default/10 pr-6">
            <span className="flex gap-1.5">Tab <span className="text-text-secondary">^⇧T</span></span>
            <span className="flex gap-1.5">Split <span className="text-text-secondary">^⇧D/E</span></span>
          </div>

          <div className="flex gap-4 border-r border-border-default/10 pr-6">
            <span className="flex gap-1.5">Pane <span className="text-text-secondary">^⇧P/N</span></span>
          </div>

          <div className="flex items-center gap-2 text-accent-primary">
            <span className="animate-pulse text-[8px]">●</span>
            <span>Palette <span className="text-text-primary font-black">^⇧K</span></span>
          </div>
        </div>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}

export default App;
