import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { Bell, LayoutGrid, Maximize2, Plus, Search, X } from "lucide-react";
import { PaneNode, Tab } from "../types";
import { useAllPaneStates, usePaneMru } from "../hooks/usePaneState";
import { PaneVolatileState, paneStateStore } from "../services/PaneStateStore";
import { getTerminalSnapshot } from "../services/terminalRegistry";
import { isCtrlDown } from "../services/modifiers";
import {
  collectPanes,
  layoutRects,
  PaneRect,
  paneTitle,
  relativeTime,
  shortenPath,
  tabTitle,
} from "../services/paneInfo";
import { KEYS } from "../keymap";
import { tabAccent } from "../tabColors";
import { formatDuration } from "../services/notifications";
import { Kbd, ShellBadge, StatusDot } from "./ui";

export type OverviewMode = "browse" | "switch";

interface PaneOverviewProps {
  open: boolean;
  /** browse: 一覧から選ぶ（Ctrl+Shift+O） / switch: Ctrl を押している間だけ表示（Ctrl+Tab） */
  mode: OverviewMode;
  /** switch モードで最初に進める方向 */
  initialDirection: 1 | -1;
  tabs: Tab[];
  activeTabId: string;
  homeDir?: string;
  onSelect: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onNewTab: () => void;
  onDismiss: () => void;
  /** 確認ダイアログなどを上に重ねている間はキー操作を受け付けない */
  suspended?: boolean;
}

interface Item {
  pane: PaneNode;
  tab: Tab;
  tabIndex: number;
  paneIndex: number;
  paneCount: number;
  rects: PaneRect[];
}

/** プレビューの行数と更新間隔 */
const PREVIEW_LINES = 12;
const PREVIEW_REFRESH_MS = 500;
/** Ctrl+Tab を一瞬だけ押した場合は一覧を出さずに直前のペインへ切り替える */
const SWITCH_REVEAL_DELAY_MS = 140;


function buildItems(tabs: Tab[]): Item[] {
  return tabs.flatMap((tab, tabIndex) => {
    const panes = collectPanes(tab.layout);
    const rects = layoutRects(tab.layout);
    return panes.map((pane, paneIndex) => ({ pane, tab, tabIndex, paneIndex, paneCount: panes.length, rects }));
  });
}

function matchesQuery(
  item: Item,
  states: Record<string, PaneVolatileState>,
  preview: string[] | undefined,
  terms: string[]
) {
  if (terms.length === 0) return true;
  const state = states[item.pane.id];
  const haystack = [
    tabTitle(item.tab, states),
    item.tab.name,
    paneTitle(item.pane, state),
    state?.cwd ?? item.pane.cwd ?? "",
    state?.shell ?? item.pane.shell ?? "",
    state?.title ?? "",
    preview?.join("\n") ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function PaneOverview(props: PaneOverviewProps) {
  return <AnimatePresence>{props.open && <OverviewSurface key="overview" {...props} />}</AnimatePresence>;
}

function OverviewSurface({
  mode,
  initialDirection,
  tabs,
  activeTabId,
  homeDir,
  onSelect,
  onClosePane,
  onNewTab,
  onDismiss,
  suspended,
}: PaneOverviewProps) {
  const states = useAllPaneStates();
  const mru = usePaneMru();
  const [query, setQuery] = useState("");
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState(mode === "browse");
  const [now, setNow] = useState(Date.now());
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPaneId = tabs.find((t) => t.id === activeTabId)?.activePaneId ?? "";

  // 並び順: browse = タブ順 / switch = 最近使った順（Alt+Tab と同じ）
  const allItems = useMemo(() => {
    const items = buildItems(tabs);
    if (mode === "browse") return items;
    const rank = new Map(mru.map((id, i) => [id, i]));
    return [...items].sort(
      (a, b) => (rank.get(a.pane.id) ?? Infinity) - (rank.get(b.pane.id) ?? Infinity)
    );
    // MRU は開いた時点の順序で固定する（選択中に並びが変わると混乱するため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, mode]);

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const items = useMemo(
    () => allItems.filter((item) => matchesQuery(item, states, previews[item.pane.id], terms)),
    [allItems, states, previews, terms]
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (mode === "browse") return currentPaneId;
    const ids = allItems.map((i) => i.pane.id);
    const start = Math.max(0, ids.indexOf(currentPaneId));
    return ids[(start + initialDirection + ids.length) % ids.length] ?? currentPaneId;
  });

  // 絞り込みで選択が消えたら先頭を選ぶ
  const selectedIndex = items.findIndex((i) => i.pane.id === selectedId);
  useEffect(() => {
    if (selectedIndex === -1 && items.length > 0) setSelectedId(items[0].pane.id);
  }, [selectedIndex, items]);

  // ライブプレビュー（Mission Control と同じく、開いている間も更新し続ける）
  useEffect(() => {
    const refresh = () => {
      const next: Record<string, string[]> = {};
      for (const item of allItems) next[item.pane.id] = getTerminalSnapshot(item.pane.id, PREVIEW_LINES);
      setPreviews(next);
      setNow(Date.now());
    };
    refresh();
    const timer = window.setInterval(refresh, PREVIEW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [allItems]);

  // switch モードは少し押し続けたときだけ一覧を見せる
  useEffect(() => {
    if (revealed) return;
    const timer = window.setTimeout(() => setRevealed(true), SWITCH_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  useEffect(() => {
    if (mode === "browse") inputRef.current?.focus();
  }, [mode]);

  // 選択中のカードを見える位置へ
  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-overview-pane="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, revealed]);

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const base = selectedIndex === -1 ? 0 : selectedIndex;
      setSelectedId(items[(base + delta + items.length * 8) % items.length].pane.id);
    },
    [items, selectedIndex]
  );

  /** グリッドの列数（上下キーで 1 行分動かすため） */
  const columns = () => {
    const grid = gridRef.current;
    if (!grid) return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  };

  const commit = useCallback(
    (paneId?: string) => {
      const id = paneId ?? items[selectedIndex]?.pane.id;
      if (id) onSelect(id);
      else onDismiss();
    },
    [items, selectedIndex, onSelect, onDismiss]
  );

  const closeSelected = useCallback(() => {
    const item = items[selectedIndex];
    if (!item) return;
    // 閉じた後は隣のカードを選ぶ
    const neighbour = items[selectedIndex + 1] ?? items[selectedIndex - 1];
    if (neighbour) setSelectedId(neighbour.pane.id);
    onClosePane(item.pane.id);
  }, [items, selectedIndex, onClosePane]);

  // 閉じるアニメーション中はキー操作を受け付けない（確定の二重実行を防ぐ）
  const isPresent = useIsPresent();

  // キー操作。検索欄にフォーカスがあっても効くよう window の capture で拾う
  useLayoutEffect(() => {
    if (!isPresent || suspended) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (mode === "switch" && !e.ctrlKey) {
        // Ctrl を離した後のキーは確定扱い
        commit();
        return;
      }

      if (e.key === "Tab") {
        handled();
        move(e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowRight") {
        handled();
        move(1);
      } else if (e.key === "ArrowLeft") {
        handled();
        move(-1);
      } else if (e.key === "ArrowDown") {
        handled();
        move(columns());
      } else if (e.key === "ArrowUp") {
        handled();
        move(-columns());
      } else if (e.key === "Home" && !query) {
        handled();
        if (items[0]) setSelectedId(items[0].pane.id);
      } else if (e.key === "End" && !query) {
        handled();
        if (items.length) setSelectedId(items[items.length - 1].pane.id);
      } else if (e.key === "Enter") {
        handled();
        commit();
      } else if (e.key === "Escape") {
        handled();
        if (query) setQuery("");
        else onDismiss();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "w") {
        handled();
        closeSelected();
      } else if (e.key === "Delete" && !query) {
        handled();
        closeSelected();
      } else if (mode === "browse" && !query && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        // 検索語が空のときだけ、数字でカードへ直接ジャンプする
        const target = items[Number(e.key) - 1];
        if (target) {
          handled();
          commit(target.pane.id);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (mode === "switch" && e.key === "Control") commit();
    };
    // Ctrl を押したままウィンドウ外へ出た場合などは確定せずに閉じる
    const onBlur = () => mode === "switch" && onDismiss();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    // リスナー登録前に Ctrl が離されていた（素早いタップ）なら、その場で確定する
    if (mode === "switch" && !isCtrlDown()) commit();
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [isPresent, suspended, mode, move, commit, closeSelected, onDismiss, items, query]);

  const tabCount = tabs.length;
  const compact = mode === "switch";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Pane overview"
      className="fixed inset-0 z-[1000] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: revealed ? 1 : 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.14 }}
      style={{ pointerEvents: revealed ? "auto" : "none" }}
    >
      <div className="absolute inset-0 bg-scrim backdrop-blur-md" onMouseDown={onDismiss} />

      <motion.div
        className="relative mx-auto flex max-h-full w-full max-w-[1400px] flex-col px-6 pb-5 pt-14"
        initial={{ scale: 0.985, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.985, y: 6 }}
        transition={{ type: "spring", damping: 30, stiffness: 380 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onDismiss();
        }}
      >
        {/* ヘッダー */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-2 text-tx-primary">
            <LayoutGrid size={16} className="text-accent" />
            <span className="text-[15px] font-semibold">{compact ? "Switch pane" : "All panes"}</span>
            <span className="text-[12px] text-tx-muted">
              {allItems.length} panes · {tabCount} {tabCount === 1 ? "tab" : "tabs"}
            </span>
          </div>
          {!compact && (
            <>
              <label className="ml-auto flex h-8 w-[min(380px,40vw)] items-center gap-2 rounded-lg border border-border-strong bg-bg-glass px-2.5 shadow-sm focus-within:border-accent">
                <Search size={14} className="text-tx-muted" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by name, directory, command or output…"
                  aria-label="Filter panes"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-tx-primary outline-none placeholder:text-tx-muted"
                />
                {query && (
                  <button type="button" aria-label="Clear filter" onClick={() => setQuery("")} className="text-tx-muted hover:text-tx-primary">
                    <X size={13} />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={onNewTab}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-bg-glass px-3 text-[12px] text-tx-secondary hover:border-accent hover:text-tx-primary"
              >
                <Plus size={13} /> New tab
              </button>
            </>
          )}
        </div>

        {/* カード */}
        <div className="no-scrollbar -m-2 min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-24 text-center text-[13px] text-tx-muted">No panes match “{query}”.</div>
          ) : (
            <div
              ref={gridRef}
              className={`grid gap-4 ${
                compact
                  ? "grid-cols-[repeat(auto-fill,minmax(230px,1fr))]"
                  : "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
              }`}
            >
              <AnimatePresence initial={true} mode="popLayout">
                {items.map((item, index) => (
                  <PaneCard
                    key={item.pane.id}
                    item={item}
                    tabLabel={tabTitle(item.tab, states)}
                    index={index}
                    state={states[item.pane.id]}
                    preview={previews[item.pane.id]}
                    selected={item.pane.id === selectedId}
                    current={item.pane.id === currentPaneId}
                    compact={compact}
                    homeDir={homeDir}
                    lastOutputAt={paneStateStore.getLastOutputAt(item.pane.id)}
                    now={now}
                    onHover={setSelectedId}
                    onOpen={commit}
                    onClose={onClosePane}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* フッター（操作ヒント） */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-tx-muted">
          {compact ? (
            <>
              <Hint keys="Tab" label="Next" />
              <Hint keys="Shift+Tab" label="Previous" />
              <Hint keys="Ctrl" label="Release to switch" />
              <Hint keys="Esc" label="Cancel" />
            </>
          ) : (
            <>
              <Hint keys="←→↑↓" label="Move" />
              <Hint keys="Enter" label="Open" />
              <Hint keys="1–9" label="Jump" />
              <Hint keys={KEYS.closePane} label="Close pane" />
              <Hint keys="Esc" label="Dismiss" />
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Kbd keys={keys} />
      <span>{label}</span>
    </span>
  );
}

interface PaneCardProps {
  item: Item;
  tabLabel: string;
  index: number;
  state: PaneVolatileState | undefined;
  preview: string[] | undefined;
  selected: boolean;
  current: boolean;
  compact: boolean;
  homeDir?: string;
  lastOutputAt?: number;
  now: number;
  onHover: (paneId: string) => void;
  onOpen: (paneId: string) => void;
  onClose: (paneId: string) => void;
}

const PaneCard = memo(function PaneCard({
  item,
  tabLabel,
  index,
  state,
  preview,
  selected,
  current,
  compact,
  homeDir,
  lastOutputAt,
  now,
  onHover,
  onOpen,
  onClose,
}: PaneCardProps) {
  const { pane, tab, tabIndex, paneIndex, paneCount, rects } = item;
  // タブ識別色（平坦に並べてもどのタブのペインか見分けられるように）
  const accent = tabAccent(tab, tabIndex);
  const title = paneTitle(pane, state);
  const cwd = shortenPath(state?.cwd ?? pane.cwd, homeDir);
  const status = state?.status ?? "starting";
  const zoomed = tab.zoomed && tab.activePaneId === pane.id && paneCount > 1;

  return (
    <motion.div
      layout
      data-overview-pane={pane.id}
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: selected ? 1.015 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ type: "spring", damping: 28, stiffness: 360, delay: Math.min(index, 12) * 0.018 }}
      onMouseEnter={() => onHover(pane.id)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => onOpen(pane.id)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose(pane.id);
        }
      }}
      role="button"
      aria-label={`${title} in ${tabLabel}`}
      aria-pressed={selected}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-bg-main text-left shadow-[var(--shadow-lg)] transition-[border-color,box-shadow] duration-150 ${
        selected
          ? "border-accent shadow-[0_0_0_3px_var(--accent-dim),var(--shadow-lg)]"
          : "border-border-strong hover:border-tx-muted/50"
      }`}
    >
      {/* タブ識別色の帯 */}
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />

      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        {index < 9 && !compact && (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-tx-primary/[0.07] font-mono text-[10px] text-tx-secondary">
            {index + 1}
          </span>
        )}
        <MiniLayout rects={rects} paneId={pane.id} color={accent} />
        <span className="min-w-0 truncate text-[11px] font-medium" style={{ color: accent }}>
          {tabLabel}
        </span>
        {paneCount > 1 && (
          <span className="shrink-0 text-[10.5px] text-tx-muted">
            {paneIndex + 1}/{paneCount}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {zoomed && <Maximize2 size={11} className="text-accent" aria-label="Zoomed" />}
          {state?.bell && <Bell size={12} className="text-warning" aria-label="Bell" />}
          {current && (
            <span className="rounded bg-accent-dim px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-accent">
              Current
            </span>
          )}
          <ShellBadge shell={state?.shell ?? pane.shell} />
          <StatusDot status={status} activity={state?.activity} />
        </span>
      </div>

      <div className="px-3">
        <div className="truncate text-[13px] font-semibold text-tx-primary">{title}</div>
        <div className="truncate font-mono text-[10.5px] text-tx-muted" title={state?.cwd ?? pane.cwd}>
          {cwd || " "}
        </div>
      </div>

      <pre
        className={`preview-fade mx-3 mb-2 mt-2 overflow-hidden whitespace-pre font-mono text-[9.5px] leading-[1.35] text-tx-secondary ${
          compact ? "h-[86px]" : "h-[132px]"
        }`}
      >
        {(preview ?? []).join("\n") || " "}
      </pre>

      <div className="flex items-center gap-2 border-t border-border-dim bg-bg-surface/60 px-3 py-1.5 text-[10.5px] text-tx-muted">
        {status === "exited" || status === "error" ? (
          <span className={status === "error" ? "text-danger" : ""}>
            {status === "error" ? "Failed to start" : `Exited${state?.exitCode != null ? ` (${state.exitCode})` : ""}`}
          </span>
        ) : state?.runningCommand ? (
          // シェル統合で分かる「今実行中のコマンド」と経過時間
          <span className="min-w-0 truncate text-warning">
            ▶ <span className="font-mono">{state.runningCommand.command}</span> · {formatDuration(now - state.runningCommand.startedAt)}
          </span>
        ) : state?.activity ? (
          <span className="text-accent">New output</span>
        ) : state?.lastCommand ? (
          <span className="min-w-0 truncate">
            {state.lastCommand.exitCode ? (
              <span className="text-danger">✗ exit {state.lastCommand.exitCode}</span>
            ) : (
              <span className="text-success">✓</span>
            )}{" "}
            <span className="font-mono">{state.lastCommand.command}</span> · {formatDuration(state.lastCommand.durationMs)} ·{" "}
            {relativeTime(state.lastCommand.finishedAt, now)}
          </span>
        ) : (
          <span>{lastOutputAt ? `Output ${relativeTime(lastOutputAt, now)}` : "Idle"}</span>
        )}
        <button
          type="button"
          aria-label="Close pane"
          title={`Close pane (${KEYS.closePane})`}
          onClick={(e) => {
            e.stopPropagation();
            onClose(pane.id);
          }}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
});

/** タブ内でのペインの位置を示すミニマップ */
function MiniLayout({ rects, paneId, color }: { rects: PaneRect[]; paneId: string; color: string }) {
  const W = 26;
  const H = 17;
  const gap = 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
      {rects.map((r) => (
        <rect
          key={r.id}
          x={r.x * W + gap / 2}
          y={r.y * H + gap / 2}
          width={Math.max(1, r.w * W - gap)}
          height={Math.max(1, r.h * H - gap)}
          rx={1.5}
          fill={r.id === paneId ? color : "var(--border-strong)"}
        />
      ))}
    </svg>
  );
}
