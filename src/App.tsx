import { useCallback, useMemo, useState, useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { TabContent } from "./components/TabContent";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { Prompt } from "./components/Prompt";
import { ptyBridge } from "./pty-bridge";
import { useLayout } from "./hooks/useLayout";
import { useKeybinds } from "./hooks/useKeybinds";
import { CommandItem } from "./types";
import { useTheme } from "./ThemeContext";
import { paneStateStore } from "./services/PaneStateStore";

function App() {
  const { setTheme } = useTheme();
  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    updateTabCwd,
    updatePaneCwd,
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

  // PaneStateStore の変更を監視して、永続化レイヤー（tabs）に同期する（デバウンス実行）
  useEffect(() => {
    let timer: any;
    const syncToPersistentState = () => {
      // 現在の volatile な CWD を tabs (useLayout) に反映する
      // ここを呼ぶと全体が再描画されるので、頻度を大幅に下げる（2秒間静止後）
      const statesEntries = Array.from((paneStateStore as any).states.entries()) as [string, any][];
      for (const [id, state] of statesEntries) {
        if (state.cwd) {
          updatePaneCwd(id, state.cwd);
        }
      }
    };

    return paneStateStore.subscribeGlobal(() => {
      clearTimeout(timer);
      timer = setTimeout(syncToPersistentState, 2000);
    });
  }, [updatePaneCwd]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    placeholder: string;
    defaultValue: string;
    onSubmit: (v: string) => void;
  }>({
    isOpen: false,
    title: "",
    placeholder: "",
    defaultValue: "",
    onSubmit: () => {},
  });
  

  const nextTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx !== -1) setActiveTabId(tabs[(idx + 1) % tabs.length].id);
  }, [tabs, activeTabId, setActiveTabId]);

  const prevTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx !== -1) setActiveTabId(tabs[(idx - 1 + tabs.length) % tabs.length].id);
  }, [tabs, activeTabId, setActiveTabId]);

  const openCwdPrompt = useCallback(async () => {
    // 優先順位: 1. タブに既に設定済みの defaultCwd, 2. システムの CWD
    const currentDefault = activeTab?.defaultCwd;
    const systemCwd = await ptyBridge.getCwd();
    
    setPromptConfig({
      isOpen: true,
      title: "Terminal: Set Start Directory",
      placeholder: "e.g. C:\\Users\\Name\\Projects",
      defaultValue: currentDefault || systemCwd || "", 
      onSubmit: (path) => updateTabCwd(activeTabId, path),
    });
  }, [activeTabId, updateTabCwd, activeTab]);

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
    onSplitHorizontal: (shell) => activePane && splitPane(activePane, "horizontal", { shell }),
    onSplitVertical: (shell) => activePane && splitPane(activePane, "vertical", { shell }),
    onClosePane: () => activePane && closePane(activePane),
  });

  const commands: CommandItem[] = useMemo(() => [
    { id: "new-tab", label: "Create New Tab", shortcut: "Ctrl+Shift+T", category: "GENERAL", action: addTab },
    { id: "set-cwd", label: "Set Start Directory", category: "TERMINAL", action: openCwdPrompt },
    { id: "split-h-cmd", label: "Split Vertically (CMD)", shortcut: "Ctrl+Shift+D", category: "LAYOUT", action: () => activePane && splitPane(activePane, "horizontal", { shell: "cmd.exe" }) },
    { id: "split-h-ps", label: "Split Vertically (PowerShell)", shortcut: "Ctrl+Alt+D", category: "LAYOUT", action: () => activePane && splitPane(activePane, "horizontal", { shell: "powershell.exe" }) },
    { id: "split-v-cmd", label: "Split Horizontally (CMD)", shortcut: "Ctrl+Shift+E", category: "LAYOUT", action: () => activePane && splitPane(activePane, "vertical", { shell: "cmd.exe" }) },
    { id: "split-v-ps", label: "Split Horizontally (PowerShell)", shortcut: "Ctrl+Alt+E", category: "LAYOUT", action: () => activePane && splitPane(activePane, "vertical", { shell: "powershell.exe" }) },
    { id: "close-pane", label: "Close Pane", shortcut: "Ctrl+Shift+W", category: "LAYOUT", action: () => activePane && closePane(activePane) },
    { id: "next-tab", label: "Next Tab", shortcut: "Ctrl+Shift+→", category: "GENERAL", action: nextTab },
    { id: "prev-tab", label: "Previous Tab", shortcut: "Ctrl+Shift+←", category: "GENERAL", action: prevTab },
    { id: "theme-dark", label: "Theme: Dark (Midnight)", category: "THEME", action: () => setTheme("dark") },
    { id: "theme-light", label: "Theme: Light (Daylight)", category: "THEME", action: () => setTheme("light") },
    { id: "theme-system", label: "Theme: Follow System", category: "THEME", action: () => setTheme("system") },
  ], [activePane, splitPane, closePane, addTab, nextTab, prevTab, setTheme, openCwdPrompt]);


  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-lg bg-bg-main shadow-2xl transition-colors duration-500">
      <TitleBar sessionName="elecxterm" />
      
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
        onTabRename={renameTab}
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
            onRatioChange={updateRatio}
          />
        ))}
      </div>

      <StatusBar 
        activeTabNumber={tabs.findIndex(t => t.id === activeTabId) + 1} 
        totalTabs={tabs.length} 
      />

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />

      <Prompt
        isOpen={promptConfig.isOpen}
        onClose={() => setPromptConfig(prev => ({ ...prev, isOpen: false }))}
        title={promptConfig.title}
        placeholder={promptConfig.placeholder}
        defaultValue={promptConfig.defaultValue}
        onSubmit={promptConfig.onSubmit}
      />
    </div>
  );
}

export default App;
