import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutNode, SplitNode } from "../types";
import { TerminalPane } from "./TerminalPane";

/** ドラッグでこれ以上小さくできない比率（各ペインの最小幅/高さ） */
const MIN_RATIO = 0.05;
/** キーボードでハンドルを操作したときの 1 ステップ */
const KEYBOARD_STEP = 0.02;

interface SplitLayoutProps {
  node: LayoutNode;
  activePane: string;
  fontFamily: string;
  fontSize: number;
  onPaneActivate: (id: string) => void;
  onRatioChange?: (path: number[], ratios: number[]) => void;
  path?: number[];
}

function SplitLayoutInner({
  node,
  activePane,
  fontFamily,
  fontSize,
  onPaneActivate,
  onRatioChange,
  path,
}: SplitLayoutProps) {
  if (node.type === "pane") {
    return (
      <TerminalPane
        pane={node}
        isActive={activePane === node.id}
        fontFamily={fontFamily}
        fontSize={fontSize}
        onActivate={onPaneActivate}
      />
    );
  }

  return (
    <SplitContainer
      node={node}
      activePane={activePane}
      fontFamily={fontFamily}
      fontSize={fontSize}
      onPaneActivate={onPaneActivate}
      onRatioChange={onRatioChange}
      path={path ?? EMPTY_PATH}
    />
  );
}

/** ルートの path。毎回 `[]` を作ると memo が効かなくなるため定数を共有する */
const EMPTY_PATH: readonly number[] = [];

export const SplitLayout = memo(SplitLayoutInner);

interface SplitContainerProps {
  node: SplitNode;
  activePane: string;
  fontFamily: string;
  fontSize: number;
  onPaneActivate: (id: string) => void;
  onRatioChange?: (path: number[], ratios: number[]) => void;
  path: readonly number[];
}

function SplitContainerInner({
  node,
  activePane,
  fontFamily,
  fontSize,
  onPaneActivate,
  onRatioChange,
  path,
}: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratios, setRatios] = useState<number[]>(node.ratio);
  const latestRatiosRef = useRef<number[]>(node.ratio);

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
  const childPaths = useMemo(
    () => node.children.map((_, index) => [...path, index]),
    [node.children, path]
  );

  /** index 番目のハンドルを delta（比率）だけ動かす */
  const applyDelta = useCallback((index: number, base: number[], delta: number) => {
    const next = [...base];
    const total = next[index] + next[index + 1];
    const left = Math.min(total - MIN_RATIO, Math.max(MIN_RATIO, next[index] + delta));
    next[index] = left;
    next[index + 1] = total - left;
    setRatios(next);
    latestRatiosRef.current = next;
  }, []);

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
        onRatioChange?.([...path], latestRatiosRef.current);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [applyDelta, isHorizontal, onRatioChange, path]
  );

  /** ハンドルのキーボード操作（矢印キーで移動 / Enter で均等化） */
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLDivElement>) => {
      const decrease = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const increase = isHorizontal ? "ArrowRight" : "ArrowDown";

      if (e.key === decrease || e.key === increase) {
        e.preventDefault();
        applyDelta(index, latestRatiosRef.current, e.key === increase ? KEYBOARD_STEP : -KEYBOARD_STEP);
        onRatioChange?.([...path], latestRatiosRef.current);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const even = Array<number>(node.children.length).fill(1 / node.children.length);
        setRatios(even);
        latestRatiosRef.current = even;
        onRatioChange?.([...path], even);
      }
    },
    [applyDelta, isHorizontal, node.children.length, onRatioChange, path]
  );

  /** ダブルクリックで均等割りに戻す */
  const handleDoubleClick = useCallback(() => {
    const even = Array<number>(node.children.length).fill(1 / node.children.length);
    setRatios(even);
    latestRatiosRef.current = even;
    onRatioChange?.([...path], even);
  }, [node.children.length, onRatioChange, path]);

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}
    >
      {node.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <div
            style={{
              [isHorizontal ? "width" : "height"]: `${(ratios[index] ?? 1 / node.children.length) * 100}%`,
              minWidth: isHorizontal ? "40px" : undefined,
              minHeight: !isHorizontal ? "30px" : undefined,
            }}
            className="relative overflow-hidden"
          >
            <SplitLayout
              node={child}
              activePane={activePane}
              fontFamily={fontFamily}
              fontSize={fontSize}
              onPaneActivate={onPaneActivate}
              onRatioChange={onRatioChange}
              path={childPaths[index]}
            />
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
              className={`group relative flex-shrink-0 z-20 touch-none outline-none ${
                isHorizontal
                  ? "w-1 cursor-col-resize h-full mx-[-2px]"
                  : "h-1 cursor-row-resize w-full my-[-2px]"
              }`}
              onPointerDown={(e) => handlePointerDown(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onDoubleClick={handleDoubleClick}
            >
              <div
                className={`absolute inset-0 bg-border-dim transition-all duration-200 group-hover:bg-accent group-focus:bg-accent group-hover:shadow-[0_0_8px_var(--color-accent-dim)] ${
                  isHorizontal
                    ? "left-1/2 w-[1px] -translate-x-1/2"
                    : "top-1/2 h-[1px] -translate-y-1/2"
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
