import { useCallback, useEffect, useState } from "react";
import { LayoutNode, PaneNode, SplitNode } from "../types";
import { load } from "@tauri-apps/plugin-store";

const STORE_PATH = "elecxterm-settings.json";

// シンプルなID生成
function generateId(): string {
  return `pane-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** レイアウトツリーの操作フック */
export function useLayout(initialLayout?: LayoutNode) {
  const [layout, setLayout] = useState<LayoutNode>(
    initialLayout ?? { type: "pane", id: "initial", shell: "powershell.exe" }
  );
  const [activePane, setActivePane] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  // セッションの読み込み
  useEffect(() => {
    async function loadSession() {
      try {
        const store = await load(STORE_PATH);
        const savedLayout = await store.get<LayoutNode>("layout");
        if (savedLayout) {
          setLayout(savedLayout);
          const first = findFirstPane(savedLayout);
          if (first && first.type === "pane") setActivePane(first.id);
        } else {
          const defaultLayout = createDefaultLayout();
          setLayout(defaultLayout);
          if (defaultLayout.type === "pane") setActivePane(defaultLayout.id);
        }
      } catch (e) {
        console.error("Failed to load session:", e);
        const defaultLayout = createDefaultLayout();
        setLayout(defaultLayout);
        if (defaultLayout.type === "pane") setActivePane(defaultLayout.id);
      } finally {
        setIsLoaded(true);
      }
    }
    loadSession();
  }, []);

  // セッションの保存
  useEffect(() => {
    if (!isLoaded) return;
    
    async function saveSession() {
      try {
        const store = await load(STORE_PATH);
        await store.set("layout", layout);
        await store.save();
      } catch (e) {
        console.error("Failed to save session:", e);
      }
    }
    
    // 頻繁な保存を避けるためにデバウンス
    const timer = setTimeout(saveSession, 1000);
    return () => clearTimeout(timer);
  }, [layout, isLoaded]);

  /** デフォルトのレイアウト（単一ペイン） */
  function createDefaultLayout(): LayoutNode {
    const id = generateId();
    return {
      type: "pane",
      id,
      shell: "cmd.exe",
    };
  }

  /** アクティブペインが設定されていない場合、最初のペインをアクティブにする */
  const ensureActivePane = useCallback(
    (node: LayoutNode) => {
      if (!activePane) {
        const firstPane = findFirstPane(node);
        if (firstPane && firstPane.type === "pane") {
          setActivePane(firstPane.id);
        }
      }
    },
    [activePane]
  );

  /** 最初のペインを見つける */
  function findFirstPane(node: LayoutNode): PaneNode | null {
    if (node.type === "pane") return node;
    for (const child of node.children) {
      const found = findFirstPane(child);
      if (found) return found;
    }
    return null;
  }

  /** ペインを分割する */
  const splitPane = useCallback(
    (
      paneId: string,
      direction: "horizontal" | "vertical",
      newPaneOptions?: Partial<PaneNode>
    ) => {
      const newPaneId = generateId();

      setLayout((prev) => {
        const newLayout = splitPaneInTree(
          prev,
          paneId,
          direction,
          newPaneId,
          newPaneOptions
        );
        return newLayout;
      });

      setActivePane(newPaneId);
      return newPaneId;
    },
    []
  );

  /** ペインを閉じる */
  const closePane = useCallback(
    (paneId: string) => {
      setLayout((prev) => {
        const result = removePaneFromTree(prev, paneId);
        if (!result) {
          // 最後のペインの場合、新しいデフォルトペインを作成
          return createDefaultLayout();
        }
        return result;
      });

      if (activePane === paneId) {
        setLayout((prev) => {
          const firstPane = findFirstPane(prev);
          if (firstPane) {
            setActivePane(firstPane.id);
          }
          return prev;
        });
      }
    },
    [activePane]
  );

  /** 分割比率を更新する */
  const updateRatio = useCallback(
    (splitNodePath: number[], ratios: number[]) => {
      setLayout((prev) => {
        return updateRatioInTree(prev, splitNodePath, ratios);
      });
    },
    []
  );

  /** 全ペインIDを順序通りに取得 */
  const getAllPaneIds = useCallback((node: LayoutNode): string[] => {
    if (node.type === "pane") return [node.id];
    return node.children.flatMap(child => getAllPaneIds(child));
  }, []);

  /** 次のペインへ移動 */
  const nextPane = useCallback(() => {
    const ids = getAllPaneIds(layout);
    const currentIndex = ids.indexOf(activePane);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + 1) % ids.length;
      setActivePane(ids[nextIndex]);
    }
  }, [layout, activePane, getAllPaneIds]);

  /** 前のペインへ移動 */
  const prevPane = useCallback(() => {
    const ids = getAllPaneIds(layout);
    const currentIndex = ids.indexOf(activePane);
    if (currentIndex !== -1) {
      const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
      setActivePane(ids[prevIndex]);
    }
  }, [layout, activePane, getAllPaneIds]);

  /** 先頭のペインへ移動 */
  const firstPane = useCallback(() => {
    const ids = getAllPaneIds(layout);
    if (ids.length > 0) setActivePane(ids[0]);
  }, [layout, getAllPaneIds]);

  /** 最後のペインへ移動 */
  const lastPane = useCallback(() => {
    const ids = getAllPaneIds(layout);
    if (ids.length > 0) setActivePane(ids[ids.length - 1]);
  }, [layout, getAllPaneIds]);

  return {
    layout,
    setLayout,
    activePane,
    setActivePane,
    splitPane,
    closePane,
    updateRatio,
    ensureActivePane,
    nextPane,
    prevPane,
    firstPane,
    lastPane,
  };
}

/** ツリー内のペインを分割する */
function splitPaneInTree(
  node: LayoutNode,
  targetId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
  newPaneOptions?: Partial<PaneNode>
): LayoutNode {
  if (node.type === "pane") {
    if (node.id === targetId) {
      const newPane: PaneNode = {
        type: "pane",
        id: newPaneId,
        shell: newPaneOptions?.shell ?? node.shell,
        cwd: newPaneOptions?.cwd ?? node.cwd,
        ...newPaneOptions,
      };
      const newSplit: SplitNode = {
        id: generateId(),
        type: direction,
        children: [node, newPane],
        ratio: [0.5, 0.5],
      };
      return newSplit;
    }
    return node;
  }

  return {
    ...node,
    children: node.children.map((child) =>
      splitPaneInTree(child, targetId, direction, newPaneId, newPaneOptions)
    ),
  };
}

/** ツリーからペインを削除する */
function removePaneFromTree(
  node: LayoutNode,
  targetId: string
): LayoutNode | null {
  if (node.type === "pane") {
    return node.id === targetId ? null : node;
  }

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

  // 比率を正規化
  const sum = newRatios.reduce((a, b) => a + b, 0);
  const normalizedRatios = newRatios.map((r) => r / sum);

  return {
    ...node,
    ratio: normalizedRatios,
    children: newChildren,
  };
}

/** 分割比率を更新する */
function updateRatioInTree(
  node: LayoutNode,
  path: number[],
  ratios: number[]
): LayoutNode {
  if (path.length === 0 && node.type !== "pane") {
    return { ...node, ratio: ratios };
  }

  if (node.type === "pane") return node;

  const [idx, ...rest] = path;
  return {
    ...node,
    children: node.children.map((child, i) =>
      i === idx ? updateRatioInTree(child, rest, ratios) : child
    ),
  };
}
