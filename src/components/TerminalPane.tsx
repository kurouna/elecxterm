import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Bell, Columns2, Maximize2, Minimize2, RotateCcw, Rows2, Search, SquareArrowOutUpRight, X } from "lucide-react";
import { PaneNode } from "../types";
import { usePaneState } from "../hooks/usePaneState";
import { usePaneActions, usePaneUi, useTabInfo } from "./PaneContext";
import {
  applyAppearance,
  attachTerminal,
  focusTerminal,
  restartTerminal,
  TerminalEntry,
} from "../services/terminalRegistry";
import { paneTitle, shortenPath } from "../services/paneInfo";
import { KEYS } from "../keymap";
import { FindBar } from "./FindBar";
import { IconButton, ShellBadge, StatusDot } from "./ui";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  pane: PaneNode;
  isActive: boolean;
}

/** コンテナ寸法が落ち着いてから fit する遅延（ドラッグ中の連続 fit によるチラつきを防ぐ） */
const RESIZE_SETTLE_MS = 60;

function TerminalPaneComponent({ pane, isActive }: TerminalPaneProps) {
  const { tabId, isTabActive, multiPane, zoomed } = useTabInfo();
  const ui = usePaneUi();
  const actions = usePaneActions();
  const state = usePaneState(pane.id);

  const hostRef = useRef<HTMLDivElement>(null);
  const [entry, setEntry] = useState<TerminalEntry | null>(null);
  const entryRef = useRef<TerminalEntry | null>(null);
  const [scrolledUp, setScrolledUp] = useState(false);

  const appearance = {
    fontFamily: ui.fontFamily,
    fontSize: ui.fontSize,
    lineHeight: ui.preferences.lineHeight,
    cursorStyle: ui.preferences.cursorStyle,
    cursorBlink: ui.preferences.cursorBlink,
    theme: ui.terminalTheme,
  };

  const fit = useCallback(() => {
    const current = entryRef.current;
    // 非表示タブ（visibility: hidden）でもサイズは保たれるが、0 サイズの時は測れないので飛ばす
    if (!current || !hostRef.current?.clientWidth) return;
    try {
      // 寸法が変われば xterm の onResize 経由で PTY にも通知される
      current.fitAddon.fit();
    } catch {
      // 破棄直後などは無視
    }
  }, []);

  // 1. Registry から Terminal を取得してホスト要素に貼り付ける（無ければ生成）。
  //    アンマウント時は Terminal を破棄せず DOM から外すだけ。これにより
  //    レイアウトツリー再構築で再マウントされても同じ xterm/PTY を継続利用でき、
  //    カレントディレクトリやスクロールバックが失われない。破棄は closePane/closeTab が行う。
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const attached = attachTerminal(host, {
      paneId: pane.id,
      cwd: pane.cwd,
      shell: pane.shell,
      ...appearance,
    });
    entryRef.current = attached;
    setEntry(attached);
    const raf = requestAnimationFrame(fit);
    return () => {
      cancelAnimationFrame(raf);
      attached.rootEl.remove();
      entryRef.current = null;
    };
    // pane.id 以外のプロパティは初回生成時にだけ反映。以降は個別 effect で更新する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id]);

  // 2. 見た目（テーマ・フォント・カーソル）の同期。実際に変化した項目だけを反映し、
  //    文字寸法が変わったときだけ fit する。テーマ切り替えの View Transition が
  //    新しい色で撮影されるよう、描画前（layout effect）に適用する。
  useLayoutEffect(() => {
    if (!entry) return;
    if (applyAppearance(entry, appearance)) fit();
    // appearance は下の各値から毎回組み立てているだけなので、値で依存を取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, ui.fontFamily, ui.fontSize, ui.terminalTheme, ui.preferences, fit]);

  // 5. スクロールバックを遡っている間は「最下部へ戻る」ボタンを出す
  useEffect(() => {
    if (!entry) return;
    const { terminal } = entry;
    const update = () => {
      const buffer = terminal.buffer.active;
      setScrolledUp(buffer.viewportY < buffer.baseY);
    };
    const subs = [terminal.onScroll(update), terminal.onWriteParsed(update)];
    entry.rootEl.addEventListener("wheel", update, { passive: true });
    update();
    return () => {
      subs.forEach((d) => d.dispose());
      entry.rootEl.removeEventListener("wheel", update);
    };
  }, [entry]);

  // 3. アクティブペイン & アクティブタブのときだけフォーカス（検索バーを開いている間は譲る）
  const findOpen = ui.findPaneId === pane.id && entry !== null;
  useEffect(() => {
    if (!isActive || !isTabActive || !entry || findOpen || ui.overlayOpen) return;
    const raf = requestAnimationFrame(() => focusTerminal(pane.id));
    return () => cancelAnimationFrame(raf);
  }, [isActive, isTabActive, entry, findOpen, ui.overlayOpen, pane.id]);

  // 4. コンテナのリサイズに追従
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let timer: number | null = null;
    const observer = new ResizeObserver(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        fit();
      }, RESIZE_SETTLE_MS);
    });
    observer.observe(host);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [fit]);

  // click ではなく pointerdown で切り替える。ドラッグ選択を始めた瞬間に
  // そのペインがアクティブになり、選択のためのドラッグが終わるまで
  // フォーカス枠が動かない、という違和感を防ぐ。
  const handlePointerDown = useCallback(() => actions.focusPane(pane.id), [actions, pane.id]);

  // 右クリック: 選択があればコピー、無ければペースト（多くのターミナルエミュレータ共通の作法）
  const handleContextMenu = useCallback(async (e: ReactMouseEvent) => {
    e.preventDefault();
    const terminal = entryRef.current?.terminal;
    if (!terminal) return;
    const selection = terminal.getSelection();
    if (selection) {
      await navigator.clipboard.writeText(selection).catch(() => {});
      terminal.clearSelection();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      // bracketed paste mode の制御シーケンス付与を xterm に任せる
      if (text) terminal.paste(text);
    } catch {
      // クリップボード権限が無い環境では黙って無視する
    }
  }, []);

  const title = paneTitle(pane, state);
  const cwd = shortenPath(state.cwd ?? pane.cwd, ui.homeDir);
  const shell = state.shell ?? pane.shell;
  const ended = state.status === "exited" || state.status === "error";
  const dim = multiPane && !zoomed && !isActive && ui.preferences.dimInactive !== "off";

  return (
    <div
      className={`pane group/pane relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-bg-main transition-[border-color,box-shadow] duration-150 ${
        state.status === "error"
          ? "border-danger/70"
          : isActive && multiPane
            ? "border-accent/70 shadow-[0_0_0_1px_var(--accent-dim)]"
            : "border-border-dim"
      }`}
      onPointerDown={handlePointerDown}
      role="group"
      aria-label={`Terminal: ${title}`}
      data-pane-id={pane.id}
      data-tab-id={tabId}
      data-dim={dim ? ui.preferences.dimInactive : undefined}
    >
      {ui.showHeaders && (
        <div
          className={`flex h-[26px] shrink-0 items-center gap-2 border-b px-2 text-[11.5px] ${
            isActive ? "border-border-dim bg-bg-surface" : "border-transparent bg-bg-main"
          }`}
          onDoubleClick={() => multiPane && actions.toggleZoom()}
        >
          <StatusDot status={state.status} activity={state.activity && !isActive} />
          <ShellBadge shell={shell} />
          <span className={`truncate font-medium ${isActive ? "text-tx-primary" : "text-tx-secondary"}`}>{title}</span>
          {cwd && title !== cwd && (
            <span className="min-w-0 truncate font-mono text-[10.5px] text-tx-muted" title={state.cwd ?? pane.cwd}>
              {cwd}
            </span>
          )}
          {state.bell && !isActive && <Bell size={12} className="shrink-0 text-warning" aria-label="Bell" />}
          {ended && (
            <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ${state.status === "error" ? "bg-danger/15 text-danger" : "bg-tx-muted/15 text-tx-muted"}`}>
              {state.status === "error" ? "failed" : `exited${state.exitCode != null ? ` ${state.exitCode}` : ""}`}
            </span>
          )}
          <div
            className={`ml-auto flex shrink-0 items-center gap-0.5 transition-opacity ${
              isActive ? "opacity-100" : "opacity-0 group-hover/pane:opacity-100"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IconButton size="sm" label="Find" shortcut={KEYS.find} onClick={() => actions.openFind(pane.id)}>
              <Search size={12} />
            </IconButton>
            <IconButton size="sm" label="Split right" shortcut={KEYS.splitRightCmd} onClick={() => actions.splitPane(pane.id, "horizontal")}>
              <Columns2 size={12} />
            </IconButton>
            <IconButton size="sm" label="Split down" shortcut={KEYS.splitDownCmd} onClick={() => actions.splitPane(pane.id, "vertical")}>
              <Rows2 size={12} />
            </IconButton>
            {multiPane && (
              <>
                <IconButton
                  size="sm"
                  label={zoomed ? "Restore layout" : "Zoom pane"}
                  shortcut={KEYS.zoom}
                  active={zoomed}
                  onClick={() => {
                    actions.focusPane(pane.id);
                    actions.toggleZoom();
                  }}
                >
                  {zoomed ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </IconButton>
                <IconButton size="sm" label="Move to new tab" onClick={() => actions.movePaneToNewTab(pane.id)}>
                  <SquareArrowOutUpRight size={12} />
                </IconButton>
              </>
            )}
            <IconButton
              size="sm"
              label="Close pane"
              shortcut={KEYS.closePane}
              className="hover:!bg-danger/15 hover:!text-danger"
              onClick={() => actions.closePane(pane.id)}
            >
              <X size={13} />
            </IconButton>
          </div>
        </div>
      )}

      <div
        className="relative min-h-0 flex-1"
        style={{ background: ui.terminalTheme.background }}
        onContextMenu={handleContextMenu}
      >
        {/* 減光は端末本体だけに掛け、検索バーやボタンは常にくっきり見せる */}
        <div ref={hostRef} className="pane-body h-full w-full px-2 pb-1 pt-1.5" />

        <AnimatePresence>
          {scrolledUp && (
            <motion.button
              key="to-bottom"
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.14 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                entry?.terminal.scrollToBottom();
                focusTerminal(pane.id);
              }}
              className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border-strong bg-bg-glass px-3 py-1 text-[11.5px] text-tx-secondary shadow-[var(--shadow-lg)] backdrop-blur-xl hover:border-accent hover:text-tx-primary"
            >
              <ArrowDown size={12} /> Jump to bottom
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {findOpen && <FindBar key="find" entry={entry} onClose={actions.closeFind} />}
        </AnimatePresence>

        {ended && (
          <div
            className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-lg border border-border-strong bg-bg-glass px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-lg)] backdrop-blur-xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className={state.status === "error" ? "text-danger" : "text-tx-secondary"}>
              {state.status === "error"
                ? "Shell failed to start"
                : `Process exited${state.exitCode != null ? ` (code ${state.exitCode})` : ""}`}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-medium text-accent-contrast hover:opacity-90"
              onClick={() => restartTerminal(pane.id)}
            >
              <RotateCcw size={12} /> Restart
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-0.5 text-tx-secondary hover:bg-tx-primary/[0.07]"
              onClick={() => actions.closePane(pane.id)}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const TerminalPane = memo(TerminalPaneComponent);
