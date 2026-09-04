import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { LayoutNode, PaneNode, Tab } from "../types";
import { load } from "@tauri-apps/plugin-store";
import { destroyTerminal, destroyOrphanTerminals } from "../services/terminalRegistry";

const STORE_PATH = "elecxterm-settings.json";
const SAVE_DEBOUNCE_MS = 500;

export const MAX_PANES = 15;
export const DEFAULT_SHELL = "cmd.exe";
export const DEFAULT_FONT_FAMILY = '"Cascadia Mono", "JetBrains Mono", "Noto Sans JP", "BIZ UDGothic", "Meiryo", "Yu Gothic", Consolas, monospace';
export const DEFAULT_FONT_SIZE = 14;
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 28;

/**
 * ID 生成。ペイン ID は terminalRegistry のキーとして使われるため、
 * 衝突は「別ペインが同じ Terminal を共有する」という致命的な症状になる。
 * 利用できる環境では crypto.randomUUID を使い、衝突可能性を実質ゼロにする。
 */
function generateId(prefix = "id"): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

/** ノード配下のペインを走査する（前順） */
function forEachPane(node: LayoutNode, visit: (pane: PaneNode) => void): void {
  if (node.type === "pane") {
    visit(node);
    return;
  }
  node.children.forEach((child) => forEachPane(child, visit));
}

/** ノード配下の全ペイン ID を表示順で取得 */
function collectPaneIds(node: LayoutNode): string[] {
  const ids: string[] = [];
  forEachPane(node, (pane) => ids.push(pane.id));
  return ids;
}

/** 全タブのペイン総数 */
function countAllPanes(tabs: Tab[]): number {
  return tabs.reduce((acc, tab) => acc + collectPaneIds(tab.layout).length, 0);
}

/** 最初のペインを見つける */
function findFirstPane(node: LayoutNode): PaneNode | null {
  if (node.type === "pane") return node;
  for (const child of node.children) {
    const found = findFirstPane(child);
    if (found) return found;
  }
  return null;
}

function createPane(cwd?: string, shell?: string): PaneNode {
  return {
    type: "pane",
    id: generateId("pane"),
    shell: shell || DEFAULT_SHELL,
    cwd,
  };
}

function createTab(name: string, cwd?: string, shell?: string): Tab {
  const layout = createPane(cwd, shell);
  return {
    id: generateId("tab"),
    name,
    layout,
    activePaneId: layout.id,
    defaultCwd: cwd,
  };
}

/** `Tab 1` のように既存と重複しない名前を作る */
function uniqueTabName(tabs: Tab[]): string {
  const used = new Set(tabs.map((t) => t.name));
  for (let i = tabs.length + 1; ; i++) {
    const candidate = `Tab ${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// 永続化データの検証
//
// store は外部ファイルであり、手編集・アプリのクラッシュ・古いバージョンの
// 書き込みで壊れうる。そのまま state に入れると描画時に落ちてアプリが
// 起動不能になるため、読み込み時に必ず正規化する。
// ---------------------------------------------------------------------------

/**
 * 検証前の「まだ信用できないノード」。PaneNode と SplitNode を交差させると
 * `type` が never になってしまうため、フィールドを個別に緩く宣言する。
 */
type RawNode = {
  type?: unknown;
  id?: unknown;
  cwd?: unknown;
  shell?: unknown;
  command?: unknown;
  children?: unknown;
  ratio?: unknown;
};

/**
 * レイアウトツリーを検証・修復する。
 * - 未知の形は捨てる（null を返す）
 * - ratio の要素数・合計を children に合わせて正す
 * - 重複した ID を振り直す（同じ Terminal を共有してしまう事故を防ぐ）
 */
function sanitizeLayout(raw: unknown, seenIds: Set<string>): LayoutNode | null {
  if (!raw || typeof raw !== "object") return null;
  const node = raw as RawNode;

  if (node.type === "pane") {
    const id = typeof node.id === "string" && node.id && !seenIds.has(node.id)
      ? node.id
      : generateId("pane");
    seenIds.add(id);
    return {
      type: "pane",
      id,
      cwd: typeof node.cwd === "string" ? node.cwd : undefined,
      shell: typeof node.shell === "string" ? node.shell : DEFAULT_SHELL,
      command: typeof node.command === "string" ? node.command : undefined,
    };
  }

  if (node.type !== "horizontal" && node.type !== "vertical") return null;
  if (!Array.isArray(node.children)) return null;

  const children = node.children
    .map((child: unknown) => sanitizeLayout(child, seenIds))
    .filter((child): child is LayoutNode => child !== null);

  if (children.length === 0) return null;
  // 子が 1 つだけになった split は意味がないので畳む
  if (children.length === 1) return children[0];

  const id = typeof node.id === "string" && node.id && !seenIds.has(node.id)
    ? node.id
    : generateId("split");
  seenIds.add(id);

  return { id, type: node.type, children, ratio: normalizeRatio(node.ratio, children.length) };
}

/** ratio を「children と同じ長さ・合計 1・各要素が正」の配列に正規化する */
function normalizeRatio(raw: unknown, length: number): number[] {
  const even = Array<number>(length).fill(1 / length);
  if (!Array.isArray(raw) || raw.length !== length) return even;

  const values = raw.map((r) => (typeof r === "number" && Number.isFinite(r) && r > 0 ? r : 0));
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return even;
  return values.map((r) => (r > 0 ? r / sum : 0));
}

/** 保存されていたタブ配列を検証・修復する。復元できるものが無ければ空配列 */
function sanitizeTabs(raw: unknown): Tab[] {
  if (!Array.isArray(raw)) return [];

  const seenIds = new Set<string>();
  const tabs: Tab[] = [];
  let paneBudget = MAX_PANES;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<Tab>;

    const layout = sanitizeLayout(candidate.layout, seenIds);
    if (!layout) continue;

    const paneIds = collectPaneIds(layout);
    // 上限を超える分は復元しない（超過状態で起動すると以降の操作が全て弾かれる）
    if (paneIds.length > paneBudget) break;
    paneBudget -= paneIds.length;

    const id = typeof candidate.id === "string" && candidate.id && !seenIds.has(candidate.id)
      ? candidate.id
      : generateId("tab");
    seenIds.add(id);

    const activePaneId =
      typeof candidate.activePaneId === "string" && paneIds.includes(candidate.activePaneId)
        ? candidate.activePaneId
        : paneIds[0];

    tabs.push({
      id,
      name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : `Tab ${tabs.length + 1}`,
      layout,
      activePaneId,
      defaultCwd: typeof candidate.defaultCwd === "string" ? candidate.defaultCwd : undefined,
    });
  }

  return tabs;
}

/** レイアウトとタブの操作フック */
export function useLayout(options?: { onNotification?: (msg: string) => void }) {
  const { onNotification } = options || {};
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabIdState] = useState<string>("");
  const [appDefaultCwd, setAppDefaultCwd] = useState<string | undefined>(undefined);
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [isLoaded, setIsLoaded] = useState(false);

  /**
   * 直近の tabs / activeTabId を同期的に読むための ref。
   * state 更新は必ず関数型で行い（イベントが連続しても取りこぼさない）、
   * 「更新直後の値を読む」用途はこの ref を使う。これにより各コールバックが
   * tabs を依存に取らずに済み、参照が安定して再描画も減る。
   */
  const tabsRef = useRef<Tab[]>(tabs);
  const activeTabIdRef = useRef<string>(activeTabId);
  const notifyRef = useRef(onNotification);
  useEffect(() => {
    notifyRef.current = onNotification;
  }, [onNotification]);

  /**
   * tabs を更新する唯一の入口。
   * `setTabs(fn)` の updater は「次のレンダ時」に実行されるため、その中で
   * tabsRef を更新しても同じイベント内の連続呼び出しには間に合わない。
   * そこで ref を先に同期更新し、React には確定値を渡す。
   * これにより「分割してすぐ閉じる」ような連続操作でも取りこぼしが起きない。
   */
  const commitTabs = useCallback((updater: (prev: Tab[]) => Tab[]) => {
    const next = updater(tabsRef.current);
    if (next === tabsRef.current) return;
    tabsRef.current = next;
    setTabs(next);
  }, []);

  const setActiveTabId = useCallback((id: string) => {
    activeTabIdRef.current = id;
    setActiveTabIdState(id);
  }, []);

  /**
   * アクティブタブだけを差し替えるヘルパー。
   * updater が同じタブ参照を返した場合は tabs 配列自体を作り直さず、
   * 無意味な再レンダ（全ペインツリーの再評価）を避ける。
   */
  const updateActiveTab = useCallback(
    (updater: (tab: Tab) => Tab) => {
      commitTabs((prev) => {
        const index = prev.findIndex((tab) => tab.id === activeTabIdRef.current);
        if (index === -1) return prev;

        const updated = updater(prev[index]);
        if (updated === prev[index]) return prev;

        const next = [...prev];
        next[index] = updated;
        return next;
      });
    },
    [commitTabs]
  );

  const notifyPaneLimit = useCallback(() => {
    notifyRef.current?.(`Maximum number of panes (${MAX_PANES}) reached.`);
  }, []);

  // 現在のアクティブタブを取得
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  // ショートカット用の現在のレイアウトとアクティブペイン
  const layout = activeTab?.layout || null;
  const activePane = activeTab?.activePaneId || "";
  const totalPanes = useMemo(() => countAllPanes(tabs), [tabs]);

  /** 新しいタブを作成 */
  const addTab = useCallback((name?: string, shell?: string, cwd?: string) => {
    if (countAllPanes(tabsRef.current) >= MAX_PANES) {
      notifyPaneLimit();
      return;
    }

    const finalCwd = cwd ?? appDefaultCwd;
    const newTab = createTab(name || uniqueTabName(tabsRef.current), finalCwd, shell);

    commitTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [appDefaultCwd, commitTabs, setActiveTabId, notifyPaneLimit]);

  const closeTab = useCallback((id: string) => {
    // 閉じるタブに属する全ペインの Terminal/PTY を明示的に破棄する。
    // TerminalPane はアンマウント時には Terminal を破棄しない設計のため、
    // ここで呼ばないと PTY がリークする。
    const closingTab = tabsRef.current.find((t) => t.id === id);
    if (!closingTab) return;
    collectPaneIds(closingTab.layout).forEach(destroyTerminal);

    const remaining = tabsRef.current.filter((t) => t.id !== id);

    // 全てのタブが閉じられた場合、新しいタブを作成してアクティブにする
    if (remaining.length === 0) {
      const newTab = createTab("Tab 1", appDefaultCwd);
      commitTabs(() => [newTab]);
      setActiveTabId(newTab.id);
      return;
    }

    // 閉じられたタブがアクティブだった場合、隣のタブをアクティブにする
    if (activeTabIdRef.current === id) {
      const index = tabsRef.current.findIndex((t) => t.id === id);
      setActiveTabId(remaining[Math.min(Math.max(0, index - 1), remaining.length - 1)].id);
    }

    commitTabs(() => remaining);
  }, [appDefaultCwd, commitTabs, setActiveTabId]);

  // セッションの読み込み
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      let restored: Tab[] = [];
      let restoredActiveId = "";

      try {
        const store = await load(STORE_PATH);
        const [savedTabs, savedActiveTabId, savedLayout, savedAppDefaultCwd, savedFontFamily, savedFontSize] =
          await Promise.all([
            store.get<unknown>("tabs"),
            store.get<string>("activeTabId"),
            store.get<unknown>("layout"),
            store.get<string>("appDefaultCwd"),
            store.get<string>("fontFamily"),
            store.get<number>("fontSize"),
          ]);

        restored = sanitizeTabs(savedTabs);

        // 古い形式（layout のみ）からの移行
        if (restored.length === 0 && savedLayout) {
          const migrated = sanitizeLayout(savedLayout, new Set());
          if (migrated) {
            restored = [{
              id: generateId("tab"),
              name: "Tab 1",
              layout: migrated,
              activePaneId: findFirstPane(migrated)?.id ?? "",
            }];
          }
        }

        if (savedActiveTabId && restored.some((t) => t.id === savedActiveTabId)) {
          restoredActiveId = savedActiveTabId;
        }

        if (cancelled) return;
        if (savedAppDefaultCwd) setAppDefaultCwd(savedAppDefaultCwd);
        if (savedFontFamily) setFontFamily(savedFontFamily);
        if (typeof savedFontSize === "number" && Number.isFinite(savedFontSize)) {
          setFontSize(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, savedFontSize)));
        }
      } catch (e) {
        console.error("Failed to load session:", e);
      }

      if (cancelled) return;

      if (restored.length === 0) restored = [createTab("Main")];
      commitTabs(() => restored);
      setActiveTabId(restoredActiveId || restored[0].id);
      setIsLoaded(true);
    }

    loadSession();
    return () => {
      cancelled = true;
    };
    // 初回のみ実行する（commitTabs / setActiveTabId は参照が安定）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // セッションの保存（デバウンス）
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(async () => {
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
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [tabs, activeTabId, appDefaultCwd, fontFamily, fontSize, isLoaded]);

  // レイアウトから消えたのに registry に残っている Terminal を掃除する保険。
  // 通常は closePane / closeTab が破棄するが、想定外の経路（永続化データの
  // 修復など）で取り残されると PTY プロセスが生き続けてしまう。
  useEffect(() => {
    if (!isLoaded) return;
    destroyOrphanTerminals(tabs.flatMap((tab) => collectPaneIds(tab.layout)));
  }, [tabs, isLoaded]);

  /** アクティブタブのペインをアクティブにする */
  const setActivePane = useCallback(
    (paneId: string) => {
      updateActiveTab((tab) => (tab.activePaneId === paneId ? tab : { ...tab, activePaneId: paneId }));
    },
    [updateActiveTab]
  );

  /** ペインを分割する。作成したペイン ID を返す（上限到達時は空文字） */
  const splitPane = useCallback(
    (
      paneId: string,
      direction: "horizontal" | "vertical",
      newPaneOptions?: Partial<PaneNode>
    ): string => {
      if (countAllPanes(tabsRef.current) >= MAX_PANES) {
        notifyPaneLimit();
        return "";
      }

      const newPaneId = generateId("pane");

      updateActiveTab((tab) => ({
        ...tab,
        layout: splitPaneInTree(tab.layout, paneId, direction, newPaneId, {
          // ユーザー指定の CWD がない場合はタブの defaultCwd を使う
          cwd: tab.defaultCwd,
          ...newPaneOptions,
        }),
        activePaneId: newPaneId,
      }));

      return newPaneId;
    },
    [updateActiveTab, notifyPaneLimit]
  );

  /** ペインを閉じる */
  const closePane = useCallback(
    (paneId: string) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab) return;

      const paneIds = collectPaneIds(tab.layout);
      if (!paneIds.includes(paneId)) return;

      // このペインがタブ内で最後の一つなら、タブごと閉じる
      if (paneIds.length === 1) {
        closeTab(tab.id);
        return;
      }

      // レイアウトツリーを更新する前に、閉じるペインの Terminal/PTY を破棄する。
      // 残ったペインは registry に保持された同じ Terminal を再アタッチするだけなので、
      // カレントディレクトリやスクロールバックは失われない。
      destroyTerminal(paneId);

      // 閉じた後は「表示順で隣」のペインへフォーカスを移す（tmux などと同じ挙動）
      const closingIndex = paneIds.indexOf(paneId);
      const neighbourId = paneIds[closingIndex + 1] ?? paneIds[closingIndex - 1];

      updateActiveTab((current) => {
        const newLayout = removePaneFromTree(current.layout, paneId);
        if (!newLayout) return current;
        return {
          ...current,
          layout: newLayout,
          activePaneId:
            current.activePaneId === paneId
              ? neighbourId ?? findFirstPane(newLayout)?.id ?? ""
              : current.activePaneId,
        };
      });
    },
    [closeTab, updateActiveTab]
  );

  /** 分割比率を更新する */
  const updateRatio = useCallback(
    (splitNodePath: number[], ratios: number[]) => {
      updateActiveTab((tab) => ({
        ...tab,
        layout: updateRatioInTree(tab.layout, splitNodePath, ratios),
      }));
    },
    [updateActiveTab]
  );

  /** 表示順でペインフォーカスを移動する共通処理 */
  const focusPaneBy = useCallback(
    (pick: (ids: string[], currentIndex: number) => string | undefined) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab) return;
      const ids = collectPaneIds(tab.layout);
      if (ids.length === 0) return;
      const next = pick(ids, ids.indexOf(tab.activePaneId));
      if (next) setActivePane(next);
    },
    [setActivePane]
  );

  const nextPane = useCallback(
    () => focusPaneBy((ids, i) => ids[(Math.max(i, 0) + 1) % ids.length]),
    [focusPaneBy]
  );
  const prevPane = useCallback(
    () => focusPaneBy((ids, i) => ids[(Math.max(i, 0) - 1 + ids.length) % ids.length]),
    [focusPaneBy]
  );
  const firstPane = useCallback(() => focusPaneBy((ids) => ids[0]), [focusPaneBy]);
  const lastPane = useCallback(() => focusPaneBy((ids) => ids[ids.length - 1]), [focusPaneBy]);

  /** タブの名前を変更 */
  const renameTab = useCallback(
    (id: string, newName: string) => {
      const name = newName.trim();
      if (!name) return;
      commitTabs((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    },
    [commitTabs]
  );

  /** タブを並び替える（ドラッグ＆ドロップ）。構成が変わっていれば破棄して安全側に倒す */
  const reorderTabs = useCallback(
    (next: Tab[]) => {
      commitTabs((prev) => {
        if (next.length !== prev.length) return prev;
        const prevIds = new Set(prev.map((t) => t.id));
        return next.every((t) => prevIds.has(t.id)) ? next : prev;
      });
    },
    [commitTabs]
  );

  /** タブの次回の開始ディレクトリを変更（既存のペインは変えない） */
  const updateTabCwd = useCallback(
    (id: string, newCwd: string) => {
      const cwd = newCwd.trim();
      if (!cwd) return;
      commitTabs((prev) => prev.map((t) => (t.id === id ? { ...t, defaultCwd: cwd } : t)));
      // アプリ全体の規定値としても保持する
      setAppDefaultCwd(cwd);
    },
    [commitTabs]
  );

  /** フォントファミリーを更新 */
  const updateFontFamily = useCallback((newFont: string) => {
    const font = newFont.trim();
    if (font) setFontFamily(font);
  }, []);

  /** フォントサイズを更新（FONT_SIZE_MIN〜FONT_SIZE_MAXにクランプ） */
  const updateFontSize = useCallback((newSize: number) => {
    if (!Number.isFinite(newSize)) return;
    setFontSize(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(newSize))));
  }, []);

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    renameTab,
    reorderTabs,
    updateTabCwd,
    fontFamily,
    updateFontFamily,
    fontSize,
    updateFontSize,
    layout,
    activePane,
    totalPanes,
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

function splitPaneInTree(
  node: LayoutNode,
  targetId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
  newPaneOptions?: Partial<PaneNode>
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== targetId) return node;

    const newPane: PaneNode = {
      ...newPaneOptions,
      type: "pane",
      id: newPaneId,
      shell: newPaneOptions?.shell ?? node.shell ?? DEFAULT_SHELL,
      cwd: newPaneOptions?.cwd ?? node.cwd,
    };
    // split ノードの ID も衝突しないよう UUID ベースで生成する。
    // Date.now() ベースだと同一ミリ秒の連続分割で React の key が重複する。
    return { id: generateId("split"), type: direction, children: [node, newPane], ratio: [0.5, 0.5] };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      splitPaneInTree(child, targetId, direction, newPaneId, newPaneOptions)
    ),
  };
}

function removePaneFromTree(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.type === "pane") return node.id === targetId ? null : node;

  const newChildren: LayoutNode[] = [];
  const newRatios: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const result = removePaneFromTree(node.children[i], targetId);
    if (result !== null) {
      newChildren.push(result);
      newRatios.push(node.ratio[i] ?? 1 / node.children.length);
    }
  }

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];

  const sum = newRatios.reduce((a, b) => a + b, 0);
  const ratio = sum > 0
    ? newRatios.map((r) => r / sum)
    : Array<number>(newChildren.length).fill(1 / newChildren.length);

  return { ...node, ratio, children: newChildren };
}

function updateRatioInTree(node: LayoutNode, path: number[], ratios: number[]): LayoutNode {
  if (node.type === "pane") return node;
  if (path.length === 0) {
    // 想定外の長さの ratio を書き込むとレイアウトが壊れるため弾く
    return ratios.length === node.children.length ? { ...node, ratio: ratios } : node;
  }
  const [idx, ...rest] = path;
  if (idx < 0 || idx >= node.children.length) return node;
  return {
    ...node,
    children: node.children.map((child, i) =>
      i === idx ? updateRatioInTree(child, rest, ratios) : child
    ),
  };
}
