import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { TabContent } from "./components/TabContent";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette, GOTO_CATEGORY } from "./components/CommandPalette";
import { Prompt, PromptRequest } from "./components/Prompt";
import { PaneOverview, OverviewMode } from "./components/PaneOverview";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { SettingsPanel } from "./components/SettingsPanel";
import { runThemeTransition } from "./themeTransition";
import { NotificationOverlay, Toast, ToastAction, ToastType } from "./components/NotificationOverlay";
import { PaneActions, PaneActionsContext, PaneUi, PaneUiContext } from "./components/PaneContext";
import { ptyBridge } from "./pty-bridge";
import { useLayout, DEFAULT_FONT_SIZE, MAX_PANES, DEFAULT_SHELL, PWSH_SHELL } from "./hooks/useLayout";
import { useKeybinds } from "./hooks/useKeybinds";
import { useWindowMaterial } from "./hooks/useWindowMaterial";
import { useCommandNotifications } from "./hooks/useCommandNotifications";
import { applyScheme } from "./theme";
import { useAllPaneStates } from "./hooks/usePaneState";
import { CommandItem } from "./types";
import { Theme, useTheme } from "./ThemeContext";
import { clearTerminal, focusTerminal, restartTerminal } from "./services/terminalRegistry";
import { paneStateStore } from "./services/PaneStateStore";
import { collectPaneIds, collectPanes, findPane, paneTitle, shortenPath, tabTitle } from "./services/paneInfo";
import { ConfirmDialog, ConfirmRequest } from "./components/ConfirmDialog";
import { FontSizeHud } from "./components/FontSizeHud";
import { WelcomeCard } from "./components/WelcomeCard";
import { KEYS } from "./keymap";

type Overlay =
  | { kind: "palette" }
  | { kind: "help" }
  | { kind: "settings" }
  | { kind: "overview"; mode: OverviewMode; direction: 1 | -1 }
  | null;

function App() {
  const { theme, setTheme, resolvedTheme, terminalTheme } = useTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [findPaneId, setFindPaneId] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string | undefined>(undefined);
  const toastId = useRef(0);

  const notify = useCallback(
    (message: string, type: ToastType = "warning", extra?: { detail?: string; action?: ToastAction }) => {
      toastId.current += 1;
      const id = toastId.current;
      // 同じ内容が連続した場合は積み重ねず置き換える
      setToasts((prev) =>
        [
          ...prev.filter((t) => t.message !== message || t.detail !== extra?.detail),
          { id, message, type, ...extra },
        ].slice(-4)
      );
    },
    []
  );
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const layout = useLayout({ onNotification: notify });
  const {
    isLoaded,
    tabs,
    activeTab,
    activeTabId,
    activePane,
    fontFamily,
    fontSize,
    showPaneHeaders,
  } = layout;
  const states = useAllPaneStates();
  const { preferences } = layout;

  // 端末の配色: プリセットが選ばれていればそれを、無ければ UI テーマ由来の配色を使う
  const effectiveTerminalTheme = useMemo(
    () => applyScheme(terminalTheme, preferences.colorScheme, resolvedTheme),
    [terminalTheme, preferences.colorScheme, resolvedTheme]
  );

  // Windows 11 の Mica / Mica Alt
  const micaSupported = useWindowMaterial(preferences.windowMaterial, theme);

  // 長時間コマンドの完了通知
  useCommandNotifications({
    thresholdSeconds: preferences.notifyAfterSeconds,
    tabs,
    notify,
    focusPane: layout.focusPane,
  });

  // ホームディレクトリ（パスの ~ 表記と開始ディレクトリの既定値に使う）
  useEffect(() => {
    ptyBridge.getDefaultCwd().then(setHomeDir).catch(() => {});
  }, []);

  // セッションを復元してからウィンドウを表示する（空の画面がちらつかないように）
  useEffect(() => {
    if (!isLoaded) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.style.visibility = "visible";
        getCurrentWindow().show().catch(() => {});
      });
    });
  }, [isLoaded]);

  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const overlayOpen = overlay !== null || prompt !== null || confirm !== null;
  const closeConfirm = useCallback(() => setConfirm(null), []);

  /**
   * 閉じる操作のガード。シェル統合で「コマンド実行中」と分かっているペインを含む場合は
   * 確認を挟む（開発サーバーなどを Ctrl+Shift+W のうっかりで止めてしまわないように）。
   */
  const guardClose = useCallback(
    (paneIds: string[], title: string, confirmLabel: string, run: () => void) => {
      const running = paneIds
        .map((id) => paneStateStore.getPaneState(id).runningCommand?.command)
        .filter((c): c is string => !!c);
      if (running.length === 0) {
        run();
        return;
      }
      setConfirm({
        title,
        message:
          running.length === 1
            ? "A command is still running. Closing will stop it."
            : `${running.length} commands are still running. Closing will stop them.`,
        items: running,
        confirmLabel,
        onConfirm: run,
      });
    },
    []
  );
  const closePaneSafe = useCallback(
    (paneId: string) => guardClose([paneId], "Close pane?", "Close pane", () => layout.closePane(paneId)),
    [guardClose, layout.closePane]
  );
  const closeTabSafe = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      guardClose(collectPaneIds(tab.layout), "Close tab?", "Close tab", () => layout.closeTab(tabId));
    },
    [tabs, guardClose, layout.closeTab]
  );
  const closeOtherTabsSafe = useCallback(
    (keepId: string) => {
      const ids = tabs.filter((t) => t.id !== keepId).flatMap((t) => collectPaneIds(t.layout));
      guardClose(ids, "Close other tabs?", "Close tabs", () => layout.closeOtherTabs(keepId));
    },
    [tabs, guardClose, layout.closeOtherTabs]
  );

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const closePrompt = useCallback(() => setPrompt(null), []);
  const toggleOverlay = useCallback(
    (next: Exclude<Overlay, null>) => setOverlay((cur) => (cur?.kind === next.kind ? null : next)),
    []
  );

  const openFind = useCallback(
    (paneId: string) => {
      layout.focusPane(paneId);
      setFindPaneId(paneId);
    },
    [layout.focusPane]
  );
  const closeFind = useCallback(() => {
    setFindPaneId((id) => {
      if (id) requestAnimationFrame(() => focusTerminal(id));
      return null;
    });
  }, []);

  /** テーマを切り替える（押した位置から円形に広がるトランジション付き） */
  const changeTheme = useCallback(
    (next: Theme, origin?: { x: number; y: number }) => {
      if (next !== theme) runThemeTransition(() => setTheme(next), origin);
    },
    [theme, setTheme]
  );
  const toggleTheme = useCallback(
    (origin?: { x: number; y: number }) => changeTheme(resolvedTheme === "dark" ? "light" : "dark", origin),
    [changeTheme, resolvedTheme]
  );

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => notify("Copied to clipboard", "success"))
        .catch(() => notify("Could not access the clipboard", "error"));
    },
    [notify]
  );

  const splitActive = useCallback(
    (direction: "horizontal" | "vertical", shell?: string) => {
      if (activePane) layout.splitPane(activePane, direction, { shell });
    },
    [activePane, layout.splitPane]
  );

  const openRenamePrompt = useCallback(() => {
    if (!activeTab) return;
    setPrompt({
      title: "Rename tab",
      description: "Leave empty to name the tab automatically after its active pane.",
      defaultValue: activeTab.renamed ? activeTab.name : "",
      placeholder: tabTitle(activeTab, paneStateStore.getAllStates()),
      onSubmit: (name) => layout.renameTab(activeTab.id, name),
    });
  }, [activeTab, layout.renameTab]);

  const handleQuickSwitch = useCallback(
    (direction: 1 | -1) => {
      if (layout.totalPanes < 2) return;
      setOverlay({ kind: "overview", mode: "switch", direction });
    },
    [layout.totalPanes]
  );

  const handleOverviewSelect = useCallback(
    (paneId: string) => {
      setOverlay(null);
      layout.focusPane(paneId);
    },
    [layout.focusPane]
  );

  // キーバインドの設定（既存のキーはすべて維持）
  useKeybinds({
    overlayOpen,
    onCommandPalette: () => toggleOverlay({ kind: "palette" }),
    onPaneOverview: () => toggleOverlay({ kind: "overview", mode: "browse", direction: 1 }),
    onQuickSwitch: handleQuickSwitch,
    onShortcutHelp: () => toggleOverlay({ kind: "help" }),
    onSettings: () => toggleOverlay({ kind: "settings" }),
    onFind: () => activePane && (findPaneId === activePane ? closeFind() : openFind(activePane)),
    onNewTab: () => layout.addTab(),
    onNextTab: layout.nextTab,
    onPrevTab: layout.prevTab,
    onGoToTab: layout.goToTab,
    onNextPane: layout.nextPane,
    onPrevPane: layout.prevPane,
    onFirstPane: layout.firstPane,
    onLastPane: layout.lastPane,
    onSplitHorizontal: (shell) => splitActive("horizontal", shell),
    onSplitVertical: (shell) => splitActive("vertical", shell),
    onClosePane: () => activePane && closePaneSafe(activePane),
    onToggleZoom: layout.toggleZoom,
    onFontSizeUp: () => layout.updateFontSize((s) => s + 1),
    onFontSizeDown: () => layout.updateFontSize((s) => s - 1),
    onFontSizeReset: () => layout.updateFontSize(DEFAULT_FONT_SIZE),
  });

  const paneActions: PaneActions = useMemo(
    () => ({
      focusPane: layout.focusPane,
      splitPane: (paneId, direction, options) => void layout.splitPane(paneId, direction, options),
      closePane: closePaneSafe,
      toggleZoom: layout.toggleZoom,
      movePaneToNewTab: layout.movePaneToNewTab,
      openFind,
      closeFind,
      updateRatio: layout.updateRatio,
    }),
    [layout.focusPane, layout.splitPane, closePaneSafe, layout.toggleZoom, layout.movePaneToNewTab, openFind, closeFind, layout.updateRatio]
  );

  const paneUi: PaneUi = useMemo(
    () => ({
      fontFamily,
      fontSize,
      terminalTheme: effectiveTerminalTheme,
      showHeaders: showPaneHeaders,
      findPaneId,
      homeDir,
      overlayOpen,
      preferences,
    }),
    [fontFamily, fontSize, effectiveTerminalTheme, showPaneHeaders, findPaneId, homeDir, overlayOpen, preferences]
  );

  const activePaneNode = activeTab ? findPane(activeTab.layout, activePane) : undefined;
  const multiPane = activeTab ? activeTab.layout.type !== "pane" : false;

  // ペイン・タブへのジャンプ項目（検索語があるときだけパレットに出る）
  const gotoCommands: CommandItem[] = useMemo(
    () =>
      tabs.flatMap((tab, tabIndex) => {
        const label = tabTitle(tab, states);
        const panes = collectPanes(tab.layout);
        const tabItem: CommandItem = {
          id: `goto-tab-${tab.id}`,
          label: `Tab ${tabIndex + 1}: ${label}`,
          description: `${panes.length} pane${panes.length > 1 ? "s" : ""}`,
          category: GOTO_CATEGORY,
          shortcut: tabIndex < 9 ? `Ctrl+Alt+${tabIndex + 1}` : undefined,
          action: () => layout.setActiveTabId(tab.id),
        };
        const paneItems = panes.map((pane): CommandItem => {
          const state = states[pane.id];
          const cwd = state?.cwd ?? pane.cwd;
          return {
            id: `goto-pane-${pane.id}`,
            label: `${paneTitle(pane, state)} — ${label}`,
            description: shortenPath(cwd, homeDir),
            keywords: `${cwd ?? ""} ${state?.title ?? ""} ${pane.shell ?? ""}`,
            category: GOTO_CATEGORY,
            action: () => layout.focusPane(pane.id),
          };
        });
        return [tabItem, ...(panes.length > 1 ? paneItems : [])];
      }),
    [tabs, states, homeDir, layout.setActiveTabId, layout.focusPane]
  );

  const commands: CommandItem[] = useMemo(
    () => [
      { id: "overview", label: "Show Pane Overview", shortcut: KEYS.overview, category: "View", keywords: "expose mission control all panes switch", action: () => setOverlay({ kind: "overview", mode: "browse", direction: 1 }) },
      { id: "shortcuts", label: "Show Keyboard Shortcuts", shortcut: KEYS.help, category: "View", keywords: "help keys", action: () => setOverlay({ kind: "help" }) },
      { id: "toggle-headers", label: showPaneHeaders ? "Hide Pane Headers" : "Show Pane Headers", category: "View", action: layout.togglePaneHeaders },
      { id: "new-tab", label: "New Tab (Command Prompt)", shortcut: KEYS.newTab, category: "Tab", action: () => layout.addTab(DEFAULT_SHELL) },
      { id: "new-tab-pwsh", label: "New Tab (PowerShell)", category: "Tab", action: () => layout.addTab(PWSH_SHELL) },
      { id: "rename-tab", label: "Rename Tab…", category: "Tab", action: openRenamePrompt },
      { id: "next-tab", label: "Next Tab", shortcut: KEYS.nextTab, category: "Tab", action: layout.nextTab },
      { id: "prev-tab", label: "Previous Tab", shortcut: KEYS.prevTab, category: "Tab", action: layout.prevTab },
      { id: "close-tab", label: "Close Tab", category: "Tab", action: () => activeTabId && closeTabSafe(activeTabId) },
      { id: "close-other-tabs", label: "Close Other Tabs", category: "Tab", action: () => activeTabId && closeOtherTabsSafe(activeTabId) },
      { id: "split-right-cmd", label: "Split Right (Command Prompt)", shortcut: KEYS.splitRightCmd, category: "Pane", action: () => splitActive("horizontal", DEFAULT_SHELL) },
      { id: "split-down-cmd", label: "Split Down (Command Prompt)", shortcut: KEYS.splitDownCmd, category: "Pane", action: () => splitActive("vertical", DEFAULT_SHELL) },
      { id: "split-right-ps", label: "Split Right (PowerShell)", shortcut: KEYS.splitRightPwsh, category: "Pane", action: () => splitActive("horizontal", PWSH_SHELL) },
      { id: "split-down-ps", label: "Split Down (PowerShell)", shortcut: KEYS.splitDownPwsh, category: "Pane", action: () => splitActive("vertical", PWSH_SHELL) },
      { id: "zoom", label: activeTab?.zoomed ? "Restore Pane Layout" : "Zoom Pane", shortcut: KEYS.zoom, category: "Pane", keywords: "maximize", action: layout.toggleZoom },
      { id: "equalize", label: "Equalize Pane Sizes", category: "Pane", keywords: "balance even", action: layout.equalizePanes },
      { id: "move-to-tab", label: "Move Pane to New Tab", category: "Pane", keywords: "break detach", action: () => activePane && layout.movePaneToNewTab(activePane) },
      { id: "next-pane", label: "Next Pane", shortcut: KEYS.nextPane, category: "Pane", action: layout.nextPane },
      { id: "prev-pane", label: "Previous Pane", shortcut: KEYS.prevPane, category: "Pane", action: layout.prevPane },
      { id: "first-pane", label: "First Pane", shortcut: KEYS.firstPane, category: "Pane", action: layout.firstPane },
      { id: "last-pane", label: "Last Pane", shortcut: KEYS.lastPane, category: "Pane", action: layout.lastPane },
      { id: "close-pane", label: "Close Pane", shortcut: KEYS.closePane, category: "Pane", action: () => activePane && closePaneSafe(activePane) },
      { id: "find", label: "Find in Terminal", shortcut: KEYS.find, category: "Terminal", keywords: "search", action: () => activePane && openFind(activePane) },
      { id: "clear", label: "Clear Scrollback", category: "Terminal", action: () => activePane && clearTerminal(activePane) },
      { id: "restart", label: "Restart Shell", category: "Terminal", keywords: "respawn reload", action: () => activePane && restartTerminal(activePane) },
      {
        id: "copy-cwd",
        label: "Copy Current Directory Path",
        category: "Terminal",
        action: () => {
          const cwd = paneStateStore.getPaneState(activePane).cwd ?? activePaneNode?.cwd;
          if (cwd) copyText(cwd);
          else notify("The current directory of this pane is not known yet", "info");
        },
      },
      { id: "settings", label: "Open Settings", shortcut: KEYS.settings, category: "Settings", keywords: "preferences font cursor start directory cwd", action: () => setOverlay({ kind: "settings" }) },
      { id: "font-size-up", label: "Increase Font Size", description: `${fontSize}px`, shortcut: KEYS.fontUp, category: "Settings", keywords: "zoom in", action: () => layout.updateFontSize((s) => s + 1) },
      { id: "font-size-down", label: "Decrease Font Size", description: `${fontSize}px`, shortcut: KEYS.fontDown, category: "Settings", keywords: "zoom out", action: () => layout.updateFontSize((s) => s - 1) },
      { id: "font-size-reset", label: "Reset Font Size", shortcut: KEYS.fontReset, category: "Settings", action: () => layout.updateFontSize(DEFAULT_FONT_SIZE) },
      { id: "theme-toggle", label: resolvedTheme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme", category: "Theme", keywords: "night day mode", action: () => toggleTheme() },
      { id: "theme-dark", label: "Theme: Midnight (Dark)", category: "Theme", action: () => changeTheme("dark") },
      { id: "theme-light", label: "Theme: Daylight (Light)", category: "Theme", action: () => changeTheme("light") },
      { id: "theme-system", label: "Theme: Follow System", category: "Theme", action: () => changeTheme("system") },
      ...gotoCommands,
    ],
    [
      layout, activeTab, activeTabId, activePane, activePaneNode, fontSize, showPaneHeaders, gotoCommands,
      splitActive, openFind, openRenamePrompt, closePaneSafe, closeTabSafe, closeOtherTabsSafe, copyText, notify, changeTheme, toggleTheme, resolvedTheme,
    ]
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app">
      <TitleBar
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onSettings={() => toggleOverlay({ kind: "settings" })}
        onOverview={() => toggleOverlay({ kind: "overview", mode: "browse", direction: 1 })}
        onPalette={() => toggleOverlay({ kind: "palette" })}
      >
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={layout.setActiveTabId}
          onTabClose={closeTabSafe}
          onCloseOthers={closeOtherTabsSafe}
          onTabColor={layout.setTabColor}
          onTabRename={(id, name) => {
            layout.renameTab(id, name);
            if (activePane) requestAnimationFrame(() => focusTerminal(activePane));
          }}
          onTabReorder={layout.reorderTabs}
          onTabAdd={(shell) => layout.addTab(shell)}
        />
      </TitleBar>

      <PaneActionsContext.Provider value={paneActions}>
        <PaneUiContext.Provider value={paneUi}>
          <main className="relative flex-1 overflow-hidden p-1.5">
            <div className="relative h-full w-full">
              {tabs.map((tab) => (
                <TabContent key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
              ))}
            </div>
          </main>
        </PaneUiContext.Provider>
      </PaneActionsContext.Provider>

      <StatusBar
        activePane={activePaneNode}
        zoomed={multiPane && !!activeTab?.zoomed}
        totalPanes={layout.totalPanes}
        maxPanes={MAX_PANES}
        fontSize={fontSize}
        homeDir={homeDir}
        onShowHelp={() => setOverlay({ kind: "help" })}
        onShowOverview={() => setOverlay({ kind: "overview", mode: "browse", direction: 1 })}
        onToggleZoom={layout.toggleZoom}
        onCopyPath={copyText}
      />

      <PaneOverview
        open={overlay?.kind === "overview"}
        mode={overlay?.kind === "overview" ? overlay.mode : "browse"}
        initialDirection={overlay?.kind === "overview" ? overlay.direction : 1}
        tabs={tabs}
        activeTabId={activeTabId}
        homeDir={homeDir}
        onSelect={handleOverviewSelect}
        onClosePane={closePaneSafe}
        suspended={confirm !== null}
        onNewTab={() => {
          setOverlay(null);
          layout.addTab();
        }}
        onDismiss={closeOverlay}
      />

      <CommandPalette isOpen={overlay?.kind === "palette"} onClose={closeOverlay} commands={commands} />
      <ShortcutHelp open={overlay?.kind === "help"} onClose={closeOverlay} />
      <SettingsPanel
        open={overlay?.kind === "settings"}
        onClose={closeOverlay}
        theme={theme}
        onThemeChange={(next) => changeTheme(next)}
        fontFamily={fontFamily}
        onFontFamilyChange={layout.updateFontFamily}
        fontSize={fontSize}
        onFontSizeChange={layout.updateFontSize}
        preferences={preferences}
        onPreferencesChange={layout.updatePreferences}
        resolvedTheme={resolvedTheme}
        micaSupported={micaSupported === true}
        showPaneHeaders={showPaneHeaders}
        onShowPaneHeadersChange={layout.setShowPaneHeaders}
        startDirectory={activeTab?.defaultCwd ?? layout.appDefaultCwd ?? ""}
        onStartDirectoryChange={(dir) => activeTab && layout.updateTabCwd(activeTab.id, dir)}
        currentDirectory={states[activePane]?.cwd ?? activePaneNode?.cwd}
      />
      <Prompt request={prompt} onClose={closePrompt} />
      <ConfirmDialog request={confirm} onClose={closeConfirm} />
      <FontSizeHud fontSize={fontSize} enabled={isLoaded} />
      <WelcomeCard ready={isLoaded} onShowShortcuts={() => setOverlay({ kind: "help" })} />
      <NotificationOverlay toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
