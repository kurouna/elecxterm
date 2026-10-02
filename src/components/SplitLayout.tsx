import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutNode, SplitNode } from "../types";
import { TerminalPane } from "./TerminalPane";
import { usePaneActions, useTabInfo } from "./PaneContext";

/** ドラッグでこれ以上小さくできない比率（各ペインの最小幅/高さ） */
const MIN_RATIO = 0.05;
/** キーボードでハンドルを操作したときの 1 ステップ */
const KEYBOARD_STEP = 0.02;

/** ルートの path。毎回 `[]` を作ると memo が効かなくなるため定数を共有する */
const EMPTY_PATH: readonly number[] = [];

interface SplitLayoutProps {
  node: LayoutNode;
  activePane: string;
  path?: readonly number[];
}

function SplitLayoutInner({ node, activePane, path }: SplitLayoutProps) {
  if (node.type === "pane") {
    return <TerminalPane pane={node} isActive={activePane === node.id} />;
  }
  return <SplitContainer node={node} activePane={activePane} path={path ?? EMPTY_PATH} />;
}

export const SplitLayout = memo(SplitLayoutInner);

interface SplitContainerProps {
  node: SplitNode;
  activePane: string;
  path: readonly number[];
}

function evenRatios(n: number): number[] {
  return Array<number>(n).fill(1 / n);
}

function SplitContainerInner({ node, activePane, path }: SplitContainerProps) {
  const { tabId } = useTabInfo();
  const { updateRatio } = usePaneActions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratios, setRatios] = useState<number[]>(node.ratio);
  const latestRatiosRef = useRef<number[]>(node.ratio);
  const [dragging, setDragging] = useState<number | null>(null);

  // node.ratio が外部から変更された場合に同期
  useEffect(() => {
    setRatios(node.ratio);
    latestRatiosRef.current = node.ratio;
  }, [node.ratio]);

  const isHorizontal = node.type === "horizontal";

  /**
   * 子ノードへ渡す path を子ごとに memo 化する。
   * `[...path, index]` をレンダのたびに作ると参照が毎回変わり、
   * SplitLayout の memo が貫通して全ペインが再レンダされてしまう。
   */
  const childPaths = useMemo(() => node.children.map((_, index) => [...path, index]), [node.children, path]);

  const setLocalRatios = useCallback((next: number[]) => {
    setRatios(next);
    latestRatiosRef.current = next;
  }, []);

  const commit = useCallback(
    (next: number[]) => updateRatio(tabId, [...path], next),
    [updateRatio, tabId, path]
  );

  /** index 番目のハンドルを delta（比率）だけ動かす */
  const applyDelta = useCallback(
    (index: number, base: number[], delta: number) => {
      const next = [...base];
      const total = next[index] + next[index + 1];
      const left = Math.min(total - MIN_RATIO, Math.max(MIN_RATIO, next[index] + delta));
      next[index] = left;
      next[index + 1] = total - left;
      setLocalRatios(next);
    },
    [setLocalRatios]
  );

  const handlePointerDown = useCallback(
    (index: number, e: React.PointerEvent<HTMLDivElement>) => {
      // 主ボタン以外（右クリック等）では開始しない
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerSize = isHorizontal ? rect.width : rect.height;
      if (containerSize <= 0) return;

      const startPos = isHorizontal ? e.clientX : e.clientY;
      const startRatios = [...latestRatiosRef.current];
      // React の合成イベントはハンドラを抜けたあと currentTarget が
      // クリアされるため、必要な値はここで取り出しておく。
      const handle = e.currentTarget;
      const pointerId = e.pointerId;

      // ポインタキャプチャを使うと、カーソルがウィンドウ外や
      // ターミナルのキャンバス上に出てもドラッグが途切れない。
      handle.setPointerCapture(pointerId);
      setDragging(index);

      const onMove = (moveEvent: PointerEvent) => {
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        applyDelta(index, startRatios, (currentPos - startPos) / containerSize);
      };

      const onEnd = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
        // pointerup 後はブラウザが自動で解放済み。解放済みの ID を渡すと
        // NotFoundError になるため、保持している場合のみ解放する。
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        setDragging(null);
        commit(latestRatiosRef.current);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [applyDelta, isHorizontal, commit]
  );

  /** ハンドルのキーボード操作（矢印キーで移動 / Enter で均等化） */
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLDivElement>) => {
      const decrease = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const increase = isHorizontal ? "ArrowRight" : "ArrowDown";

      if (e.key === decrease || e.key === increase) {
        e.preventDefault();
        applyDelta(index, latestRatiosRef.current, e.key === increase ? KEYBOARD_STEP : -KEYBOARD_STEP);
        commit(latestRatiosRef.current);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const even = evenRatios(node.children.length);
        setLocalRatios(even);
        commit(even);
      }
    },
    [applyDelta, isHorizontal, node.children.length, commit, setLocalRatios]
  );

  /** ダブルクリックで均等割りに戻す */
  const handleDoubleClick = useCallback(() => {
    const even = evenRatios(node.children.length);
    setLocalRatios(even);
    commit(even);
  }, [node.children.length, commit, setLocalRatios]);

  return (
    <div ref={containerRef} className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}>
      {node.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <div
            style={{
              [isHorizontal ? "width" : "height"]: `${(ratios[index] ?? 1 / node.children.length) * 100}%`,
              minWidth: isHorizontal ? "60px" : undefined,
              minHeight: !isHorizontal ? "48px" : undefined,
            }}
            className="relative overflow-hidden"
          >
            <SplitLayout node={child} activePane={activePane} path={childPaths[index]} />
          </div>

          {index < node.children.length - 1 && (
            <div
              role="separator"
              tabIndex={0}
              aria-orientation={isHorizontal ? "vertical" : "horizontal"}
              aria-label={isHorizontal ? "Resize panes horizontally" : "Resize panes vertically"}
              aria-valuenow={Math.round((ratios[index] ?? 0) * 100)}
              aria-valuemin={Math.round(MIN_RATIO * 100)}
              aria-valuemax={100 - Math.round(MIN_RATIO * 100)}
              title="Drag to resize · double-click to equalize"
              className={`group relative z-20 flex-shrink-0 touch-none outline-none ${
                isHorizontal ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"
              }`}
              onPointerDown={(e) => handlePointerDown(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onDoubleClick={handleDoubleClick}
            >
              {/* 見た目より広い当たり判定（左右/上下に 4px ずつはみ出す） */}
              <div className={`absolute ${isHorizontal ? "inset-y-0 -inset-x-1" : "inset-x-0 -inset-y-1"}`} />
              <div
                className={`absolute rounded-full transition-colors duration-150 ${
                  dragging === index ? "bg-accent" : "bg-transparent group-hover:bg-accent/60 group-focus-visible:bg-accent"
                } ${
                  isHorizontal
                    ? "left-1/2 top-2 bottom-2 w-[2px] -translate-x-1/2"
                    : "top-1/2 left-2 right-2 h-[2px] -translate-y-1/2"
                }`}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

const SplitContainer = memo(SplitContainerInner);
