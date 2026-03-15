import { useCallback, useMemo, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { TabContent } from "./components/TabContent";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { useLayout } from "./hooks/useLayout";
import { useKeybinds } from "./hooks/useKeybinds";
import { CommandItem, PaneStatus } from "./types";
import { useTheme } from "./ThemeContext";

function App() {
  const { setTheme } = useTheme();
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
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
  const [paneStatuses, setPaneStatuses] = useState<Record<string, PaneStatus>>({});

  const handlePaneStatusChange = useCallback((id: string, status: PaneStatus) => {
    setPaneStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);

  const nextTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx !== -1) setActiveTabId(tabs[(idx + 1) % tabs.length].id);
  }, [tabs, activeTabId, setActiveTabId]);

  const prevTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx !== -1) setActiveTabId(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  }, [tabs, activeTabId, setActiveTabId]);

  // キーバインドの設定
  useKeybinds({
    onCommandPalette: () => setCommandPaletteOpen((v) => !v),
    onNewTab: () => addTab(),
    onNextTab: nextTab,
    onPrevTab: prevTab,
    onNextPane: nextPane,
    onPrevPane: prevPane,
    onFirstPane: firstPane,
    onLastPane: lastPane,
    onSplitHorizontal: () => activePane && splitPane(activePane, "horizontal"),
    onSplitVertical: () => activePane && splitPane(activePane, "vertical"),
    onClosePane: () => activePane && closePane(activePane),
  });

  const commands: CommandItem[] = useMemo(() => [
    { id: "new-tab", label: "新しいタブを作成", shortcut: "Ctrl+Shift+T", category: "全般", action: addTab },
    { id: "split-h-cmd", label: "縦に分割 (CMD)", shortcut: "Ctrl+Shift+D", category: "レイアウト", action: () => activePane && splitPane(activePane, "horizontal", { shell: "cmd.exe" }) },
    { id: "split-h-ps", label: "縦に分割 (PowerShell)", category: "レイアウト", action: () => activePane && splitPane(activePane, "horizontal", { shell: "powershell.exe" }) },
    { id: "split-v-cmd", label: "横に分割 (CMD)", shortcut: "Ctrl+Shift+E", category: "レイアウト", action: () => activePane && splitPane(activePane, "vertical", { shell: "cmd.exe" }) },
    { id: "split-v-ps", label: "横に分割 (PowerShell)", category: "レイアウト", action: () => activePane && splitPane(activePane, "vertical", { shell: "powershell.exe" }) },
    { id: "close-pane", label: "ペインを閉じる", shortcut: "Ctrl+Shift+W", category: "レイアウト", action: () => activePane && closePane(activePane) },
    { id: "next-tab", label: "次のタブへ移動", shortcut: "Ctrl+Shift+→", category: "全般", action: nextTab },
    { id: "prev-tab", label: "前のタブへ移動", shortcut: "Ctrl+Shift+←", category: "全般", action: prevTab },
    { id: "theme-dark", label: "テーマ: ダーク (Midnight)", category: "テーマ", action: () => setTheme("dark") },
    { id: "theme-light", label: "テーマ: ライト (Daylight)", category: "テーマ", action: () => setTheme("light") },
    { id: "theme-system", label: "テーマ: システム設定に従う", category: "テーマ", action: () => setTheme("system") },
  ], [activePane, splitPane, closePane, addTab, nextTab, prevTab, setTheme]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-lg bg-surface-primary shadow-2xl transition-colors duration-500">
      <TitleBar sessionName="elecxterm" />
      
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
        onTabAdd={() => addTab()}
      />

      <div className="flex-1 overflow-hidden p-0.5 relative">
        {tabs.map((tab) => (
          <TabContent
            key={tab.id}
            layout={tab.layout}
            activePane={tab.activePaneId}
            isActive={tab.id === activeTabId}
            onPaneActivate={setActivePane}
            onPaneStatusChange={handlePaneStatusChange}
            onRatioChange={updateRatio}
          />
        ))}
      </div>

      <StatusBar 
        paneStatuses={paneStatuses} 
        activeTabNumber={tabs.findIndex(t => t.id === activeTabId) + 1} 
        totalTabs={tabs.length} 
      />

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}

export default App;
