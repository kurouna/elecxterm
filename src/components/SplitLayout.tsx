import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LayoutNode, PaneNode, PaneStatus } from "../types";
import { TerminalPane } from "./TerminalPane";

interface SplitLayoutProps {
  node: LayoutNode;
  activePane: string;
  onPaneActivate: (id: string) => void;
  onPaneStatusChange?: (id: string, status: PaneStatus) => void;
  onRatioChange?: (path: number[], ratios: number[]) => void;
  path?: number[];
  depth?: number;
}

export function SplitLayout({
  node,
  activePane,
  onPaneActivate,
  onPaneStatusChange,
  onRatioChange,
  path = [],
  depth = 0,
}: SplitLayoutProps) {
  if (node.type === "pane") {
    return (
      <motion.div
        className="h-full w-full"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <TerminalPane
          pane={node}
          isActive={activePane === node.id}
          onFocus={() => onPaneActivate(node.id)}
          onStatusChange={(status) =>
            onPaneStatusChange?.(node.id, status)
          }
        />
      </motion.div>
    );
  }

  return (
    <SplitContainer
      node={node}
      activePane={activePane}
      onPaneActivate={onPaneActivate}
      onPaneStatusChange={onPaneStatusChange}
      onRatioChange={onRatioChange}
      path={path}
      depth={depth}
    />
  );
}

interface SplitContainerProps {
  node: LayoutNode & { type: "horizontal" | "vertical" };
  activePane: string;
  onPaneActivate: (id: string) => void;
  onPaneStatusChange?: (id: string, status: PaneStatus) => void;
  onRatioChange?: (path: number[], ratios: number[]) => void;
  path: number[];
  depth: number;
}

function SplitContainer({
  node,
  activePane,
  onPaneActivate,
  onPaneStatusChange,
  onRatioChange,
  path,
  depth,
}: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratios, setRatios] = useState<number[]>(node.ratio);
  const dragStartRef = useRef<{
    index: number;
    startPos: number;
    startRatios: number[];
  } | null>(null);

  const isHorizontal = node.type === "horizontal";

  /** リサイズハンドルのドラッグ開始 */
  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragStartRef.current = {
        index,
        startPos: isHorizontal ? e.clientX : e.clientY,
        startRatios: [...ratios],
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const containerSize = isHorizontal
          ? containerRect.width
          : containerRect.height;

        const currentPos = isHorizontal
          ? moveEvent.clientX
          : moveEvent.clientY;
        const delta =
          (currentPos - dragStartRef.current.startPos) / containerSize;

        const newRatios = [...dragStartRef.current.startRatios];
        const minRatio = 0.1; // 最小比率10%

        const left = newRatios[dragStartRef.current.index] + delta;
        const right = newRatios[dragStartRef.current.index + 1] - delta;

        if (left >= minRatio && right >= minRatio) {
          newRatios[dragStartRef.current.index] = left;
          newRatios[dragStartRef.current.index + 1] = right;
          setRatios(newRatios);
        }
      };

      const handleMouseUp = () => {
        if (dragStartRef.current) {
          onRatioChange?.(path, ratios);
          dragStartRef.current = null;
        }
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [isHorizontal, ratios, onRatioChange]
  );

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}
    >
      {node.children.map((child, index) => (
        <React.Fragment key={getNodeKey(child)}>
          {/* ペイン / サブスプリット */}
          <div
            style={{
              [isHorizontal ? "width" : "height"]: `${ratios[index] * 100}%`,
              minWidth: isHorizontal ? "60px" : undefined,
              minHeight: !isHorizontal ? "40px" : undefined,
            }}
            className="relative overflow-hidden"
          >
            <SplitLayout
              node={child}
              activePane={activePane}
              onPaneActivate={onPaneActivate}
              onPaneStatusChange={onPaneStatusChange}
              onRatioChange={onRatioChange}
              path={[...path, index]}
              depth={depth + 1}
            />
          </div>

          {/* リサイズハンドル（最後の要素以外） */}
          {index < node.children.length - 1 && (
            <div
              className={`group relative flex-shrink-0 z-20 ${
                isHorizontal
                  ? "w-1 cursor-col-resize h-full mx-[-2px]"
                  : "h-1 cursor-row-resize w-full my-[-2px]"
              }`}
              onMouseDown={(e) => handleMouseDown(index, e)}
            >
              {/* 視覚的な細いライン */}
              <div
                className={`absolute inset-0 transition-colors duration-200 group-hover:bg-accent-primary/50 ${
                  isHorizontal
                    ? "left-1/2 w-[1px] -translate-x-1/2"
                    : "top-1/2 h-[1px] -translate-y-1/2"
                }`}
                style={{
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  boxShadow: "0 0 8px var(--color-glow-active)",
                }}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

import React from "react";

/** ノードの一意キーを取得 */
function getNodeKey(node: LayoutNode): string {
  return node.id;
}
