import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { LayoutNode, PaneNode, Preferences, Tab, TabColor, TAB_COLORS } from "../types";
import { load } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { destroyTerminal, destroyOrphanTerminals } from "../services/terminalRegistry";
import { paneStateStore } from "../services/PaneStateStore";
import { collectPaneIds, collectPanes, findPane } from "../services/paneInfo";

const STORE_PATH = "elecxterm-settings.json";
const SAVE_DEBOUNCE_MS = 500;

export const MAX_PANES = 15;
export const DEFAULT_SHELL = "cmd.exe";
export const PWSH_SHELL = "pwsh.exe";
export const DEFAULT_FONT_FAMILY = '"Cascadia Mono", "JetBrains Mono", "Noto Sans JP", "BIZ UDGothic", "Meiryo", "Yu Gothic", Consolas, monospace';
export const DEFAULT_FONT_SIZE = 14;
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 28;

export const DEFAULT_PREFERENCES: Preferences = {
  cursorStyle: "bar",
  cursorBlink: true,
  dimInactive: "subtle",
  lineHeight: 1.3,
};

/** 保存されていた設定を検証し、壊れた項目は既定値に戻す */
function sanitizePreferences(raw: unknown): Preferences {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Preferences, unknown>>;
  const d = DEFAULT_PREFERENCES;
  return {
    cursorStyle: r.cursorStyle === "block" || r.cursorStyle === "underline" || r.cursorStyle === "bar" ? r.cursorStyle : d.cursorStyle,
    cursorBlink: typeof r.cursorBlink === "boolean" ? r.cursorBlink : d.cursorBlink,
    dimInactive: r.dimInactive === "off" || r.dimInactive === "strong" || r.dimInactive === "subtle" ? r.dimInactive : d.dimInactive,
    lineHeight:
      typeof r.lineHeight === "number" && r.lineHeight >= 1 && r.lineHeight <= 2 ? r.lineHeight : d.lineHeight,
  };
}

export type SplitDirection = "horizontal" | "vertical";

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

/** 全タブのペイン総数 */
function countAllPanes(tabs: Tab[]): number {
  return tabs.reduce((acc, tab) => acc + collectPaneIds(tab.layout).length, 0);
}

function createPane(cwd?: string, shell?: string): PaneNode {
  return { type: "pane", id: generateId("pane"), shell: shell || DEFAULT_SHELL, cwd };
}

function createTab(name: string, cwd?: string, shell?: string): Tab {
  const layout = createPane(cwd, shell);
  return { id: generateId("tab"), name, layout, activePaneId: layout.id, defaultCwd: cwd };
}

/** `Tab 1` のように既存と重複しない名前を作る */
function uniqueTabName(tabs: Tab[]): string {
  const used = new Set(tabs.map((t) => t.name));
  for (let i = tabs.length + 1; ; i++) {
    const candidate = `Tab ${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** シェル統合で追跡している最新の cwd（無ければ起動時の cwd） */
function liveCwd(pane: PaneNode): string | undefined {
  return paneStateStore.getPaneState(pane.id).cwd ?? pane.cwd;
}

/** 保存用に、各ペインの cwd を最新の値へ置き換えたレイアウトを作る */
function withLiveCwd(node: LayoutNode): LayoutNode {
  if (node.type === "pane") {
    const cwd = liveCwd(node);
    return cwd === node.cwd ? node : { ...node, cwd };
  }
  return { ...node, children: node.children.map(withLiveCwd) };
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
  children?: unknown;
  ratio?: unknown;
};

function stableId(raw: unknown, prefix: string, seenIds: Set<string>): string {
  const id = typeof raw === "string" && raw && !seenIds.has(raw) ? raw : generateId(prefix);
  seenIds.add(id);
  return id;
}

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
    return {
      type: "pane",
      id: stableId(node.id, "pane", seenIds),
      cwd: typeof node.cwd === "string" ? node.cwd : undefined,
      shell: typeof node.shell === "string" ? node.shell : DEFAULT_SHELL,
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

  return {
    id: stableId(node.id, "split", seenIds),
    type: node.type,
    children,
    ratio: normalizeRatio(node.ratio, children.length),
  };
}

/** ratio を「children と同じ長さ・合計 1・各要素が正」の配列に正規化する */
function normalizeRatio(raw: unknown, length: number): number[] {
  const even = Array<number>(length).fill(1 / length);
  if (!Array.isArray(raw) || raw.length !== length) return even;

  const values = raw.map((r) => (typeof r === "number" && Number.isFinite(r) && r > 0 ? r : 0));
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0 || values.some((r) => r === 0)) return even;
  return values.map((r) => r / sum);
}

/** 自動命名（"Tab 3" / 旧バージョンの "Main"）か */
function isAutoName(name: string): boolean {
  return /^Tab \d+$/.test(name) || name === "Main";
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

    const name =
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name
        : `Tab ${tabs.length + 1}`;

    tabs.push({
      id: stableId(candidate.id, "tab", seenIds),
      name,
      // 旧バージョンには renamed が無い。自動命名でない名前はユーザーが付けたものとみなす
      renamed: typeof candidate.renamed === "boolean" ? candidate.renamed : !isAutoName(name),
      layout,
      activePaneId:
        typeof candidate.activePaneId === "string" && paneIds.includes(candidate.activePaneId)
          ? candidate.activePaneId
          : paneIds[0],
      defaultCwd: typeof candidate.defaultCwd === "string" ? candidate.defaultCwd : undefined,
      // ズームは復元しない。非表示のペインはマウントされず、シェルが起動しないため
      zoomed: false,
      color: TAB_COLORS.includes(candidate.color as TabColor) ? candidate.color : undefined,
    });
  }

  return tabs;
}

// ---------------------------------------------------------------------------
// レイアウトツリー操作（純粋関数）
// ---------------------------------------------------------------------------

function splitPaneInTree(
  node: LayoutNode,
  targetId: string,
  direction: SplitDirection,
  newPane: PaneNode
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== targetId) return node;
    // split ノードの ID も衝突しないよう UUID ベースで生成する。
    // Date.now() ベースだと同一ミリ秒の連続分割で React の key が重複する。
    return { id: generateId("split"), type: direction, children: [node, newPane], ratio: [0.5, 0.5] };
  }
  return {
    ...node,
    children: node.children.map((child) => splitPaneInTree(child, targetId, direction, newPane)),
  };
}

function removePaneFromTree(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.type === "pane") return node.id === targetId ? null : node;

  const newChildren: LayoutNode[] = [];
  const newRatios: number[] = [];
  node.children.forEach((child, i) => {
    const result = removePaneFromTree(child, targetId);
    if (result !== null) {
      newChildren.push(result);
      newRatios.push(node.ratio[i] ?? 1 / node.children.length);
    }
  });

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return { ...node, ratio: normalizeRatio(newRatios, newChildren.length), children: newChildren };
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
    children: node.children.map((child, i) => (i === idx ? updateRatioInTree(child, rest, ratios) : child)),
  };
}

function equalizeTree(node: LayoutNode): LayoutNode {
  if (node.type === "pane") return node;
  const n = node.children.length;
  return { ...node, ratio: Array<number>(n).fill(1 / n), children: node.children.map(equalizeTree) };
}

// ---------------------------------------------------------------------------

export interface UseLayoutOptions {
  onNotification?: (msg: string) => void;
}

/** レイアウトとタブの操作フック */
export function useLayout(options?: UseLayoutOptions) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabIdState] = useState<string>("");
  const [appDefaultCwd, setAppDefaultCwd] = useState<string | undefined>(undefined);
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [showPaneHeaders, setShowPaneHeaders] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  /**
   * 直近の tabs / activeTabId を同期的に読むための ref。
   * 「更新直後の値を読む」用途はこの ref を使う。これにより各コールバックが
   * tabs を依存に取らずに済み、参照が安定して再描画も減る。
   */
  const tabsRef = useRef<Tab[]>(tabs);
  const activeTabIdRef = useRef<string>(activeTabId);
  const notifyRef = useRef(options?.onNotification);
  notifyRef.current = options?.onNotification;
  const settingsRef = useRef({ appDefaultCwd, fontFamily, fontSize, showPaneHeaders, preferences });
  settingsRef.current = { appDefaultCwd, fontFamily, fontSize, showPaneHeaders, preferences };

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
   * 特定のタブだけを差し替えるヘルパー。
   * updater が同じタブ参照を返した場合は tabs 配列自体を作り直さず、
   * 無意味な再レンダ（全ペインツリーの再評価）を避ける。
   */
  const updateTab = useCallback(
    (tabId: string, updater: (tab: Tab) => Tab) => {
      commitTabs((prev) => {
        const index = prev.findIndex((tab) => tab.id === tabId);
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

  const updateActiveTab = useCallback(
    (updater: (tab: Tab) => Tab) => updateTab(activeTabIdRef.current, updater),
    [updateTab]
  );

  const findTabOfPane = useCallback(
    (paneId: string) => tabsRef.current.find((tab) => findPane(tab.layout, paneId)),
    []
  );

  const hasRoomForPane = useCallback(() => {
    if (countAllPanes(tabsRef.current) < MAX_PANES) return true;
    notifyRef.current?.(`Maximum number of panes (${MAX_PANES}) reached.`);
    return false;
  }, []);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || null, [tabs, activeTabId]);
  const activePane = activeTab?.activePaneId || "";
  const totalPanes = useMemo(() => countAllPanes(tabs), [tabs]);

  // ---- 永続化 ---------------------------------------------------------------

  const saveTimerRef = useRef<number | null>(null);

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      const store = await load(STORE_PATH);
      const settings = settingsRef.current;
      await store.set(
        "tabs",
        tabsRef.current.map((tab) => ({ ...tab, layout: withLiveCwd(tab.layout) }))
      );
      await store.set("activeTabId", activeTabIdRef.current);
      await store.set("appDefaultCwd", settings.appDefaultCwd);
      await store.set("fontFamily", settings.fontFamily);
      await store.set("fontSize", settings.fontSize);
      await store.set("showPaneHeaders", settings.showPaneHeaders);
      await store.set("preferences", settings.preferences);
      await store.save();
    } catch (e) {
      console.error("Failed to save session:", e);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow();
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // セッションの読み込み
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      let restored: Tab[] = [];
      let restoredActiveId = "";

      try {
        const store = await load(STORE_PATH);
        const [savedTabs, savedActiveTabId, savedLayout, savedAppDefaultCwd, savedFontFamily, savedFontSize, savedHeaders, savedPreferences] =
          await Promise.all([
            store.get<unknown>("tabs"),
            store.get<string>("activeTabId"),
            store.get<unknown>("layout"),
            store.get<string>("appDefaultCwd"),
            store.get<string>("fontFamily"),
            store.get<number>("fontSize"),
            store.get<boolean>("showPaneHeaders"),
            store.get<unknown>("preferences"),
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
              activePaneId: collectPaneIds(migrated)[0],
            }];
          }
        }

        if (savedActiveTabId && restored.some((t) => t.id === savedActiveTabId)) {
          restoredActiveId = savedActiveTabId;
        }

        if (cancelled) return;
        if (typeof savedAppDefaultCwd === "string" && savedAppDefaultCwd) setAppDefaultCwd(savedAppDefaultCwd);
        if (typeof savedFontFamily === "string" && savedFontFamily.trim()) setFontFamily(savedFontFamily);
        if (typeof savedFontSize === "number" && Number.isFinite(savedFontSize)) {
          setFontSize(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(savedFontSize))));
        }
        if (typeof savedHeaders === "boolean") setShowPaneHeaders(savedHeaders);
        setPreferences(sanitizePreferences(savedPreferences));
      } catch (e) {
        console.error("Failed to load session:", e);
      }

      if (cancelled) return;

      if (restored.length === 0) restored = [createTab("Tab 1")];
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

  // 状態が変わったら保存を予約する
  useEffect(() => {
    if (isLoaded) scheduleSave();
  }, [tabs, activeTabId, appDefaultCwd, fontFamily, fontSize, showPaneHeaders, preferences, isLoaded, scheduleSave]);

  // シェルの cd でも保存する（次回起動時に各ペインが最後のディレクトリで開く）
  useEffect(() => {
    if (!isLoaded) return;
    let lastSignature = "";
    return paneStateStore.subscribeGlobal(() => {
      const states = paneStateStore.getAllStates();
      const signature = Object.keys(states).map((id) => `${id}=${states[id].cwd ?? ""}`).join("|");
      if (signature === lastSignature) return;
      lastSignature = signature;
      scheduleSave();
    });
  }, [isLoaded, scheduleSave]);

  // ウィンドウを閉じる直前に、デバウンス待ちの保存を確実に書き出す
  useEffect(() => {
    if (!isLoaded) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWindow()
      .onCloseRequested(async () => {
        await saveNow();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isLoaded, saveNow]);

  // レイアウトから消えたのに registry に残っている Terminal を掃除する保険。
  // 通常は closePane / closeTab が破棄するが、想定外の経路（永続化データの
  // 修復など）で取り残されると PTY プロセスが生き続けてしまう。
  useEffect(() => {
    if (!isLoaded) return;
    destroyOrphanTerminals(tabs.flatMap((tab) => collectPaneIds(tab.layout)));
  }, [tabs, isLoaded]);

  // フォーカス中のペインをストアへ伝える（未読フラグの解除と MRU 更新）
  useEffect(() => {
    paneStateStore.setFocusedPane(activePane || null);
  }, [activePane]);

  // ---- タブ操作 -------------------------------------------------------------

  /** 新しいタブを作成 */
  const addTab = useCallback(
    (shell?: string, cwd?: string) => {
      if (!hasRoomForPane()) return;
      const newTab = createTab(uniqueTabName(tabsRef.current), cwd ?? settingsRef.current.appDefaultCwd, shell);
      commitTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    },
    [commitTabs, setActiveTabId, hasRoomForPane]
  );

  const closeTab = useCallback(
    (id: string) => {
      // 閉じるタブに属する全ペインの Terminal/PTY を明示的に破棄する。
      // TerminalPane はアンマウント時には Terminal を破棄しない設計のため、
      // ここで呼ばないと PTY がリークする。
      const index = tabsRef.current.findIndex((t) => t.id === id);
      if (index === -1) return;
      collectPaneIds(tabsRef.current[index].layout).forEach(destroyTerminal);

      const remaining = tabsRef.current.filter((t) => t.id !== id);

      // 全てのタブが閉じられた場合、新しいタブを作成してアクティブにする
      if (remaining.length === 0) {
        const newTab = createTab("Tab 1", settingsRef.current.appDefaultCwd);
        commitTabs(() => [newTab]);
        setActiveTabId(newTab.id);
        return;
      }

      // 閉じられたタブがアクティブだった場合、隣のタブをアクティブにする
      if (activeTabIdRef.current === id) {
        setActiveTabId(remaining[Math.min(Math.max(0, index - 1), remaining.length - 1)].id);
      }
      commitTabs(() => remaining);
    },
    [commitTabs, setActiveTabId]
  );

  const closeOtherTabs = useCallback(
    (keepId: string) => {
      if (!tabsRef.current.some((t) => t.id === keepId)) return;
      tabsRef.current.filter((t) => t.id !== keepId).forEach((t) => closeTab(t.id));
      setActiveTabId(keepId);
    },
    [closeTab, setActiveTabId]
  );

  /** 相対移動でタブを切り替える（端で循環） */
  const cycleTab = useCallback(
    (delta: number) => {
      const list = tabsRef.current;
      const idx = list.findIndex((t) => t.id === activeTabIdRef.current);
      if (idx === -1 || list.length === 0) return;
      setActiveTabId(list[(idx + delta + list.length) % list.length].id);
    },
    [setActiveTabId]
  );
  const nextTab = useCallback(() => cycleTab(1), [cycleTab]);
  const prevTab = useCallback(() => cycleTab(-1), [cycleTab]);

  /** n 番目（0 始まり）のタブへ。範囲外は最後のタブ */
  const goToTab = useCallback(
    (index: number) => {
      const list = tabsRef.current;
      if (list.length === 0) return;
      setActiveTabId(list[Math.min(index, list.length - 1)].id);
    },
    [setActiveTabId]
  );

  /** タブの名前を変更。空文字を渡すと自動命名（アクティブペインに追従）に戻す */
  const renameTab = useCallback(
    (id: string, newName: string) => {
      const name = newName.trim();
      updateTab(id, (t) => (name ? { ...t, name, renamed: true } : { ...t, renamed: false }));
    },
    [updateTab]
  );

  /** タブの識別色を設定（undefined で自動に戻す） */
  const setTabColor = useCallback(
    (id: string, color: TabColor | undefined) => updateTab(id, (t) => (t.color === color ? t : { ...t, color })),
    [updateTab]
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
      updateTab(id, (t) => ({ ...t, defaultCwd: cwd }));
      // アプリ全体の規定値としても保持する
      setAppDefaultCwd(cwd);
    },
    [updateTab]
  );

  // ---- ペイン操作 -----------------------------------------------------------

  /** 任意のタブのペインへフォーカスする（必要ならタブも切り替える） */
  const focusPane = useCallback(
    (paneId: string) => {
      const tab = findTabOfPane(paneId);
      if (!tab) return;
      if (tab.activePaneId !== paneId) updateTab(tab.id, (t) => ({ ...t, activePaneId: paneId }));
      if (activeTabIdRef.current !== tab.id) setActiveTabId(tab.id);
    },
    [findTabOfPane, updateTab, setActiveTabId]
  );

  /**
   * ペインを分割する。新しいペインは分割元の「今いるディレクトリ」で開く
   * （シェル統合で追跡した cwd → タブの開始ディレクトリ → 分割元の起動ディレクトリ）。
   * 作成したペイン ID を返す（上限到達時は空文字）。
   */
  const splitPane = useCallback(
    (paneId: string, direction: SplitDirection, newPaneOptions?: { shell?: string; cwd?: string }): string => {
      const tab = findTabOfPane(paneId);
      if (!tab || !hasRoomForPane()) return "";
      const source = findPane(tab.layout, paneId)!;
      const newPane: PaneNode = {
        type: "pane",
        id: generateId("pane"),
        shell: newPaneOptions?.shell ?? source.shell ?? DEFAULT_SHELL,
        cwd: newPaneOptions?.cwd ?? paneStateStore.getPaneState(paneId).cwd ?? tab.defaultCwd ?? source.cwd,
      };
      updateTab(tab.id, (t) => ({
        ...t,
        layout: splitPaneInTree(t.layout, paneId, direction, newPane),
        activePaneId: newPane.id,
        zoomed: false,
      }));
      if (activeTabIdRef.current !== tab.id) setActiveTabId(tab.id);
      return newPane.id;
    },
    [findTabOfPane, hasRoomForPane, updateTab, setActiveTabId]
  );

  /** ペインをレイアウトから外す（Terminal は破棄しない）。外したペインを返す */
  const detachPane = useCallback(
    (paneId: string): PaneNode | null => {
      const tab = findTabOfPane(paneId);
      if (!tab) return null;
      const panes = collectPanes(tab.layout);
      const index = panes.findIndex((p) => p.id === paneId);
      const pane = panes[index];
      if (panes.length === 1) return null;

      // 閉じた後は「表示順で隣」のペインへフォーカスを移す（tmux などと同じ挙動）
      const neighbourId = (panes[index + 1] ?? panes[index - 1]).id;
      updateTab(tab.id, (t) => {
        const layout = removePaneFromTree(t.layout, paneId);
        if (!layout) return t;
        return {
          ...t,
          layout,
          activePaneId: t.activePaneId === paneId ? neighbourId : t.activePaneId,
          zoomed: t.zoomed && layout.type !== "pane",
        };
      });
      return pane;
    },
    [findTabOfPane, updateTab]
  );

  /** ペインを閉じる。タブ内の最後の一つならタブごと閉じる */
  const closePane = useCallback(
    (paneId: string) => {
      const tab = findTabOfPane(paneId);
      if (!tab) return;
      if (collectPaneIds(tab.layout).length === 1) {
        closeTab(tab.id);
        return;
      }
      // レイアウトツリーを更新する前に、閉じるペインの Terminal/PTY を破棄する。
      // 残ったペインは registry に保持された同じ Terminal を再アタッチするだけなので、
      // カレントディレクトリやスクロールバックは失われない。
      destroyTerminal(paneId);
      detachPane(paneId);
    },
    [findTabOfPane, closeTab, detachPane]
  );

  /** ペインを新しいタブへ移す（tmux の break-pane）。端末はそのまま引き継がれる */
  const movePaneToNewTab = useCallback(
    (paneId: string) => {
      const pane = detachPane(paneId);
      if (!pane) {
        notifyRef.current?.("This pane is already alone in its tab.");
        return;
      }
      const newTab: Tab = {
        id: generateId("tab"),
        name: uniqueTabName(tabsRef.current),
        layout: pane,
        activePaneId: pane.id,
        defaultCwd: liveCwd(pane),
      };
      commitTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    },
    [detachPane, commitTabs, setActiveTabId]
  );

  /** 分割比率を更新する */
  const updateRatio = useCallback(
    (tabId: string, splitNodePath: number[], ratios: number[]) => {
      updateTab(tabId, (tab) => ({ ...tab, layout: updateRatioInTree(tab.layout, splitNodePath, ratios) }));
    },
    [updateTab]
  );

  /** アクティブタブの全分割を均等にする */
  const equalizePanes = useCallback(() => {
    updateActiveTab((tab) => (tab.layout.type === "pane" ? tab : { ...tab, layout: equalizeTree(tab.layout) }));
  }, [updateActiveTab]);

  /** アクティブペインの最大化を切り替える */
  const toggleZoom = useCallback(() => {
    updateActiveTab((tab) => (tab.layout.type === "pane" ? tab : { ...tab, zoomed: !tab.zoomed }));
  }, [updateActiveTab]);

  /** 表示順でペインフォーカスを移動する共通処理 */
  const focusPaneBy = useCallback(
    (pick: (ids: string[], currentIndex: number) => string | undefined) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab) return;
      const ids = collectPaneIds(tab.layout);
      const next = pick(ids, ids.indexOf(tab.activePaneId));
      if (next) focusPane(next);
    },
    [focusPane]
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

  // ---- 設定 -----------------------------------------------------------------

  /** フォントファミリーを更新 */
  const updateFontFamily = useCallback((newFont: string) => {
    const font = newFont.trim();
    if (font) setFontFamily(font);
  }, []);

  /** フォントサイズを更新（FONT_SIZE_MIN〜FONT_SIZE_MAXにクランプ） */
  const updateFontSize = useCallback((newSize: number | ((current: number) => number)) => {
    setFontSize((current) => {
      const value = typeof newSize === "function" ? newSize(current) : newSize;
      if (!Number.isFinite(value)) return current;
      return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)));
    });
  }, []);

  const togglePaneHeaders = useCallback(() => setShowPaneHeaders((v) => !v), []);

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => setPreferences((prev) => sanitizePreferences({ ...prev, ...patch })),
    []
  );

  return {
    isLoaded,
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    closeOtherTabs,
    nextTab,
    prevTab,
    goToTab,
    renameTab,
    reorderTabs,
    updateTabCwd,
    appDefaultCwd,
    fontFamily,
    updateFontFamily,
    fontSize,
    updateFontSize,
    showPaneHeaders,
    setShowPaneHeaders,
    togglePaneHeaders,
    preferences,
    updatePreferences,
    setTabColor,
    activePane,
    totalPanes,
    focusPane,
    splitPane,
    closePane,
    movePaneToNewTab,
    updateRatio,
    equalizePanes,
    toggleZoom,
    nextPane,
    prevPane,
    firstPane,
    lastPane,
  };
}

export type LayoutApi = ReturnType<typeof useLayout>;
