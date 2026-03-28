import { useCallback, useEffect, useState, useMemo } from "react";
import { LayoutNode, PaneNode, Tab } from "../types";
import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "elecxterm-settings.json";
export const MAX_PANES = 15;
export const DEFAULT_FONT_FAMILY = '"Cascadia Mono", "JetBrains Mono", "Noto Sans JP", "BIZ UDGothic", "Meiryo", "Yu Gothic", Consolas, monospace';
export const DEFAULT_FONT_SIZE = 14;
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 28;

// シンプルなID生成
function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** 全ペインの総数を計算する */
function countAllPanes(tabs: Tab[]): number {
  const countInNode = (node: LayoutNode): number => {
    if (node.type === "pane") return 1;
    return node.children.reduce((acc, child) => acc + countInNode(child), 0);
  };
  return tabs.reduce((acc, tab) => acc + countInNode(tab.layout), 0);
}

/** 最初のペインを見つける (Hoisted) */
function findFirstPane(node: LayoutNode): PaneNode | null {
  if (node.type === "pane") return node;
  for (const child of node.children) {
    const found = findFirstPane(child);
    if (found) return found;
  }
  return null;
}

/** レイアウトとタブの操作フック */
export function useLayout(options?: { onNotification?: (msg: string) => void }) {
  const { onNotification } = options || {};
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [appDefaultCwd, setAppDefaultCwd] = useState<string | undefined>(undefined);
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [isLoaded, setIsLoaded] = useState(false);

  /** 全ペインIDを順序通りに取得 */
  const getAllPaneIds = useCallback((node: LayoutNode): string[] => {
    if (node.type === "pane") return [node.id];
    return node.children.flatMap(child => getAllPaneIds(child));
  }, []);

  // 現在のアクティブタブを取得
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  // ショートカット用の現在のレイアウトとアクティブペイン
  const layout = activeTab?.layout || null;
  const activePane = activeTab?.activePaneId || "";

  /** デフォルトのレイアウト（単一ペイン） */
  function createDefaultLayout(cwd?: string, shell?: string): LayoutNode {
    return {
      type: "pane",
      id: generateId(),
      shell: shell || "cmd.exe",
      cwd: cwd,
    };
  }

  /** 新しいタブを作成 */
  const addTab = useCallback((name?: string, shell?: string, cwd?: string) => {
    // 全体のペイン数制限チェック
    if (countAllPanes(tabs) >= MAX_PANES) {
      onNotification?.(`Maximum number of panes (${MAX_PANES}) reached.`);
      return;
    }

    const finalCwd = cwd || appDefaultCwd;
    const newTab: Tab = {
      id: generateId(),
      name: name || `Tab ${tabs.length + 1}`,
      layout: createDefaultLayout(finalCwd, shell),
      activePaneId: "",
      defaultCwd: finalCwd,
    };
    // 初期ペインをアクティブに設定
    const first = findFirstPane(newTab.layout);
    if (first) newTab.activePaneId = first.id;

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs.length, appDefaultCwd, tabs]);

  const closeTab = useCallback((id: string) => {
    const filtered = tabs.filter((t) => t.id !== id);
    
    // 全てのタブが閉じられた場合、新しいタブを作成してアクティブにする
    if (filtered.length === 0) {
      const newTab: Tab = {
        id: generateId(),
        name: "Tab 1",
        layout: createDefaultLayout(appDefaultCwd),
        activePaneId: "",
        defaultCwd: appDefaultCwd,
      };
      const first = findFirstPane(newTab.layout);
      if (first) newTab.activePaneId = first.id;
      
      setTabs([newTab]);
      setActiveTabId(newTab.id);
      return;
    }
    
    // 閉じられたタブがアクティブだった場合、別のタブをアクティブにする
    if (activeTabId === id) {
      const index = tabs.findIndex(t => t.id === id);
      const nextIndex = Math.max(0, index - 1);
      const nextId = filtered[nextIndex].id;
      setActiveTabId(nextId);
    }
    
    setTabs(filtered);
  }, [tabs, activeTabId, setActiveTabId, getAllPaneIds, appDefaultCwd]);

  // セッションの読み込み
  useEffect(() => {
    async function loadSession() {
      try {
        const store = await load(STORE_PATH);
        const savedTabs = await store.get<Tab[]>("tabs");
        const savedActiveTabId = await store.get<string>("activeTabId");

        if (savedTabs && savedTabs.length > 0) {
          setTabs(savedTabs);
          setActiveTabId(savedActiveTabId || savedTabs[0].id);
        } else {
          // 古い形式（layoutのみ）の互換性チェック
          const savedLayout = await store.get<LayoutNode>("layout");
          if (savedLayout) {
             const newTab: Tab = {
               id: generateId(),
               name: "Tab 1",
               layout: savedLayout,
               activePaneId: findFirstPane(savedLayout)?.id || "",
             };
             setTabs([newTab]);
             setActiveTabId(newTab.id);
          } else {
            addTab("Main");
          }
        }

        const savedAppDefaultCwd = await store.get<string>("appDefaultCwd");
        if (savedAppDefaultCwd) setAppDefaultCwd(savedAppDefaultCwd);

        const savedFontFamily = await store.get<string>("fontFamily");
        if (savedFontFamily) setFontFamily(savedFontFamily);

        const savedFontSize = await store.get<number>("fontSize");
        if (savedFontSize) setFontSize(savedFontSize);
      } catch (e) {
        console.error("Failed to load session:", e);
        addTab("Main");
      } finally {
        setIsLoaded(true);
      }
    }
    loadSession();
  }, []); // addTabを依存関係に入れるとループするので注意

  // セッションの保存
  useEffect(() => {
    if (!isLoaded) return;
    
    async function saveSession() {
      try {
        const store = await load(STORE_PATH);
        await store.set("tabs", tabs);
        await store.set("activeTabId", activeTabId);
        await store.set("appDefaultCwd", appDefaultCwd);
        await store.set("fontFamily", fontFamily);
        await store.set("fontSize", fontSize);
        await store.save();
      } catch (e) {
        console.error("Failed to save session:", e);
      }
    }
    
    // 状態が変更されたら即座に、あるいは短いバッファで保存
    const timer = setTimeout(saveSession, 500);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, appDefaultCwd, fontFamily, fontSize, isLoaded]);


  /** アクティブタブのペインをアクティブにする */
  const setActivePane = useCallback((paneId: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, activePaneId: paneId } : t));
  }, [activeTabId]);

  /** ペインを分割する */
  const splitPane = useCallback(
    (
      paneId: string,
      direction: "horizontal" | "vertical",
      newPaneOptions?: Partial<PaneNode>
    ) => {
      // 全体のペイン数制限チェック
      if (countAllPanes(tabs) >= MAX_PANES) {
        onNotification?.(`Maximum number of panes (${MAX_PANES}) reached.`);
        return ""; // 分割失敗を示すために空文字列を返すか、エラーをスロー
      }

      const newPaneId = generateId();

      setTabs((prev) => prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        
        // ユーザー指定のCWDがない場合は、タブのdefaultCwdを使用する
        const optionsWithCwd = {
          cwd: tab.defaultCwd,
          ...newPaneOptions
        };

        return {
          ...tab,
          layout: splitPaneInTree(tab.layout, paneId, direction, newPaneId, optionsWithCwd),
          activePaneId: newPaneId
        };
      }));

      return newPaneId;
    },
    [activeTabId, tabs]
  );

  /** ペインを閉じる */
  const closePane = useCallback(
    (paneId: string) => {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        const paneIds = getAllPaneIds(tab.layout);
        // このペインがタブ内で最後の一つなら、タブごと閉じる
        if (paneIds.length === 1 && paneIds[0] === paneId) {
          closeTab(activeTabId);
          return;
        }
      }

      setTabs((prev) => prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        const newLayout = removePaneFromTree(tab.layout, paneId) || createDefaultLayout(appDefaultCwd);
        let newActiveId = tab.activePaneId;
        if (newActiveId === paneId) {
          newActiveId = findFirstPane(newLayout)?.id || "";
        }
        return {
          ...tab,
          layout: newLayout,
          activePaneId: newActiveId
        };
      }));
    },
    [tabs, activeTabId, closeTab, getAllPaneIds, appDefaultCwd]
  );

  /** 分割比率を更新する */
  const updateRatio = useCallback(
    (splitNodePath: number[], ratios: number[]) => {
      setTabs((prev) => prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          layout: updateRatioInTree(tab.layout, splitNodePath, ratios)
        };
      }));
    },
    [activeTabId]
  );


  /** 次のペインへ移動 */
  const nextPane = useCallback(() => {
    if (!layout) return;
    const ids = getAllPaneIds(layout);
    const currentIndex = ids.indexOf(activePane);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % ids.length;
      setActivePane(ids[nextIndex]);
    }
  }, [layout, activePane, getAllPaneIds, setActivePane]);

  /** 前のペインへ移動 */
  const prevPane = useCallback(() => {
    if (!layout) return;
    const ids = getAllPaneIds(layout);
    const currentIndex = ids.indexOf(activePane);
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
      setActivePane(ids[prevIndex]);
    }
  }, [layout, activePane, getAllPaneIds, setActivePane]);

  /** 先頭のペインへ移動 */
  const firstPane = useCallback(() => {
    if (!layout) return;
    const ids = getAllPaneIds(layout);
    if (ids.length > 0) setActivePane(ids[0]);
  }, [layout, getAllPaneIds, setActivePane]);

  /** 最後のペインへ移動 */
  const lastPane = useCallback(() => {
    if (!layout) return;
    const ids = getAllPaneIds(layout);
    if (ids.length > 0) setActivePane(ids[ids.length - 1]);
  }, [layout, getAllPaneIds, setActivePane]);

  /** タブの名前を変更 */
  const renameTab = useCallback((id: string, newName: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
  }, []);


  /** タブの次回の開始ディレクトリを変更（既存のペインは変えない） */
  const updateTabCwd = useCallback((id: string, newCwd: string) => {
    // タブの個別設定を更新
    setTabs(prev => prev.map(t => t.id === id ? { 
      ...t, 
      defaultCwd: newCwd
    } : t));
    // アプリ全体の規定値としても保持する
    setAppDefaultCwd(newCwd);
  }, []);

  /** フォントファミリーを更新 */
  const updateFontFamily = useCallback((newFont: string) => {
    setFontFamily(newFont);
  }, []);

  /** フォントサイズを更新（FONT_SIZE_MIN〜FONT_SIZE_MAXにクランプ） */
  const updateFontSize = useCallback((newSize: number) => {
    setFontSize(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, newSize)));
  }, []);

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    updateTabCwd,
    fontFamily,
    updateFontFamily,
    fontSize,
    updateFontSize,
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
  };
}


function splitPaneInTree(node: LayoutNode, targetId: string, direction: "horizontal" | "vertical", newPaneId: string, newPaneOptions?: Partial<PaneNode>): LayoutNode {
  if (node.type === "pane") {
    if (node.id === targetId) {
      const newPane: PaneNode = { 
        type: "pane", 
        id: newPaneId, 
        shell: newPaneOptions?.shell ?? node.shell ?? "cmd.exe", 
        cwd: newPaneOptions?.cwd ?? node.cwd, 
        ...newPaneOptions 
      };
      return { id: `split-${Date.now()}`, type: direction, children: [node, newPane], ratio: [0.5, 0.5] };
    }
    return node;
  }
  return { ...node, children: node.children.map((child) => splitPaneInTree(child, targetId, direction, newPaneId, newPaneOptions)) };
}

function removePaneFromTree(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.type === "pane") return node.id === targetId ? null : node;
  const newChildren: LayoutNode[] = [];
  const newRatios: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const result = removePaneFromTree(node.children[i], targetId);
    if (result !== null) {
      newChildren.push(result);
      newRatios.push(node.ratio[i]);
    }
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  const sum = newRatios.reduce((a, b) => a + b, 0);
  return { ...node, ratio: newRatios.map((r) => r / sum), children: newChildren };
}

function updateRatioInTree(node: LayoutNode, path: number[], ratios: number[]): LayoutNode {
  if (path.length === 0 && node.type !== "pane") return { ...node, ratio: ratios };
  if (node.type === "pane") return node;
  const [idx, ...rest] = path;
  return { ...node, children: node.children.map((child, i) => i === idx ? updateRatioInTree(child, rest, ratios) : child) };
}
