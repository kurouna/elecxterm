import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

import { NotificationOverlay } from "./components/NotificationOverlay";

function App() {
  const { setTheme, resolvedTheme } = useTheme();
  const isFirstRender = useRef(true);
  const [notification, setNotification] = useState<string | null>(null);

  // テーマの準備ができたらウィンドウを表示
  useEffect(() => {
    if (isFirstRender.current) {
      const appWindow = getCurrentWindow();
      
      // テーマが適用され、DOMの準備が整ってから表示
      // requestAnimationFrame を重ねることで確実に描画を待つ
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.style.visibility = 'visible';
          appWindow.show();
        });
      });
      isFirstRender.current = false;
    }
  }, [resolvedTheme]);

  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    updateTabCwd,
    activePane,
    setActivePane,
    splitPane,
    closePane,
    updateRatio,
    nextPane,
    prevPane,
    firstPane,
    lastPane,
    fontFamily,
    updateFontFamily,
  } = useLayout({
    onNotification: (msg) => setNotification(msg)
  });


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
  
  const openFontPrompt = useCallback(() => {
    setPromptConfig({
      isOpen: true,
      title: "Terminal: Set Font Family",
      placeholder: 'e.g. "Fira Code", "Cascadia Code", monospace',
      defaultValue: fontFamily,
      onSubmit: (font) => updateFontFamily(font),
    });
  }, [fontFamily, updateFontFamily]);

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
    { id: "set-font", label: "Set Font Family", category: "TERMINAL", action: openFontPrompt },
    { id: "split-h-cmd", label: "Split Vertically (CMD)", shortcut: "Ctrl+Shift+D", category: "LAYOUT", action: () => activePane && splitPane(activePane, "horizontal", { shell: "cmd.exe" }) },
    { id: "split-h-ps", label: "Split Vertically (PowerShell)", shortcut: "Ctrl+Alt+D", category: "LAYOUT", action: () => activePane && splitPane(activePane, "horizontal", { shell: "powershell.exe" }) },
    { id: "split-v-cmd", label: "Split Horizontally (CMD)", shortcut: "Ctrl+Shift+E", category: "LAYOUT", action: () => activePane && splitPane(activePane, "vertical", { shell: "cmd.exe" }) },
    { id: "split-v-ps", label: "Split Horizontally (PowerShell)", shortcut: "Ctrl+Alt+E", category: "LAYOUT", action: () => activePane && splitPane(activePane, "vertical", { shell: "powershell.exe" }) },
    { id: "close-pane", label: "Close Pane", shortcut: "Ctrl+Shift+W", category: "LAYOUT", action: () => activePane && closePane(activePane) },
    { id: "next-pane", label: "Next Pane", shortcut: "Ctrl+Shift+N/↓", category: "LAYOUT", action: nextPane },
    { id: "prev-pane", label: "Previous Pane", shortcut: "Ctrl+Shift+P/↑", category: "LAYOUT", action: prevPane },
    { id: "next-tab", label: "Next Tab", shortcut: "Ctrl+Shift+F/→", category: "GENERAL", action: nextTab },
    { id: "prev-tab", label: "Previous Tab", shortcut: "Ctrl+Shift+B/←", category: "GENERAL", action: prevTab },
    { id: "theme-dark", label: "Theme: Dark (Midnight)", category: "THEME", action: () => setTheme("dark") },
    { id: "theme-light", label: "Theme: Light (Daylight)", category: "THEME", action: () => setTheme("light") },
    { id: "theme-system", label: "Theme: Follow System", category: "THEME", action: () => setTheme("system") },
  ], [activePane, splitPane, closePane, addTab, nextTab, prevTab, nextPane, prevPane, setTheme, openCwdPrompt, openFontPrompt]);


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
            fontFamily={fontFamily}
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

      <NotificationOverlay 
        message={notification} 
        onClear={() => setNotification(null)} 
      />
    </div>
  );
}

export default App;
