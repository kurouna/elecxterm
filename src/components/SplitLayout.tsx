import React, { useCallback, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { LayoutNode } from "../types";
import { TerminalPane } from "./TerminalPane";

interface SplitLayoutProps {
  node: LayoutNode;
  activePane: string;
  onPaneActivate: (id: string) => void;
  onRatioChange?: (path: number[], ratios: number[]) => void;
  path?: number[];
  depth?: number;
}

export function SplitLayout({
  node,
  activePane,
  onPaneActivate,
  onRatioChange,
  path = [],
  depth = 0,
}: SplitLayoutProps) {
  if (node.type === "pane") {
    return (
      <motion.div
        className="h-full w-full"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      >
        <TerminalPane
          pane={node}
          isActive={activePane === node.id}
          onFocus={() => onPaneActivate(node.id)}
        />
      </motion.div>
    );
  }

  return (
    <SplitContainer
      node={node as LayoutNode & { type: "horizontal" | "vertical" }}
      activePane={activePane}
      onPaneActivate={onPaneActivate}
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
  onRatioChange?: (path: number[], ratios: number[]) => void;
  path: number[];
  depth: number;
}

function SplitContainer({
  node,
  activePane,
  onPaneActivate,
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

  // node.ratio が外部から変更された場合に同期
  useEffect(() => {
    setRatios(node.ratio);
  }, [node.ratio]);

  const isHorizontal = node.type === "horizontal";

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
        const containerSize = isHorizontal ? containerRect.width : containerRect.height;
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        
        const delta = (currentPos - dragStartRef.current.startPos) / containerSize;
        const newRatios = [...dragStartRef.current.startRatios];
        const minRatio = 0.05;

        const left = Math.max(minRatio, newRatios[dragStartRef.current.index] + delta);
        const right = Math.max(minRatio, newRatios[dragStartRef.current.index + 1] - delta);

        // 合計を1に維持するための調整
        const diff = (newRatios[dragStartRef.current.index] + newRatios[dragStartRef.current.index + 1]) - (left + right);
        
        newRatios[dragStartRef.current.index] = left;
        newRatios[dragStartRef.current.index + 1] = right + diff;
        
        setRatios(newRatios);
        onRatioChange?.(path, newRatios);
      };

      const handleMouseUp = () => {
        dragStartRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [isHorizontal, ratios, onRatioChange, path]
  );

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}
    >
      {node.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <div
            style={{
              [isHorizontal ? "width" : "height"]: `${ratios[index] * 100}%`,
              minWidth: isHorizontal ? "40px" : undefined,
              minHeight: !isHorizontal ? "30px" : undefined,
            }}
            className="relative overflow-hidden"
          >
            <SplitLayout
              node={child}
              activePane={activePane}
              onPaneActivate={onPaneActivate}
              onRatioChange={onRatioChange}
              path={[...path, index]}
              depth={depth + 1}
            />
          </div>

          {index < node.children.length - 1 && (
            <div
              className={`group relative flex-shrink-0 z-20 ${
                isHorizontal
                  ? "w-1 cursor-col-resize h-full mx-[-2px]"
                  : "h-1 cursor-row-resize w-full my-[-2px]"
              }`}
              onMouseDown={(e) => handleMouseDown(index, e)}
            >
              <div
                className={`absolute inset-0 transition-all duration-300 group-hover:bg-accent-primary/40 ${
                  isHorizontal
                    ? "left-1/2 w-[1px] -translate-x-1/2"
                    : "top-1/2 h-[1px] -translate-y-1/2"
                }`}
                style={{
                  backgroundColor: "var(--color-border-active)",
                  opacity: 0.1,
                  boxShadow: "0 0 10px var(--color-glow-active)",
                }}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
