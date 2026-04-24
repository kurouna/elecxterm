import { createContext, memo, useContext, useMemo } from "react";
import { SplitLayout } from "./SplitLayout";
import { LayoutNode } from "../types";

// タブの表示状態を伝播するためのシンプルなContext
const TabVisibilityContext = createContext({ isActive: false });
export const useTabVisibility = () => useContext(TabVisibilityContext);

interface TabContentProps {
  layout: LayoutNode;
  activePane: string;
  isActive: boolean;
  fontFamily: string;
  fontSize: number;
  onPaneActivate: (id: string) => void;
  onRatioChange: (path: number[], ratios: number[]) => void;
}

/**
 * タブのコンテンツ。非アクティブなタブも DOM にマウントしたまま保持して
 * PTY と xterm の状態を維持するが、`visibility` と `z-index` で瞬時に
 * 切り替えることでタブ切替時のクロスフェード由来のチラつきを防ぐ。
 */
function TabContentComponent({
  layout,
  activePane,
  isActive,
  fontFamily,
  fontSize,
  onPaneActivate,
  onRatioChange,
}: TabContentProps) {
  // Context value を isActive が変わった時だけ再生成する。
  // こうしないと TabContent の再レンダごとに新規オブジェクトが作られ、
  // useContext 経由で TerminalPane 群が React.memo を貫通して再レンダされる。
  const visibilityValue = useMemo(() => ({ isActive }), [isActive]);

  return (
    <TabVisibilityContext.Provider value={visibilityValue}>
      <div
        aria-hidden={!isActive}
        className="absolute inset-0 p-0.5"
        style={{
          visibility: isActive ? "visible" : "hidden",
          zIndex: isActive ? 10 : 0,
          pointerEvents: isActive ? "auto" : "none",
        }}
      >
        <SplitLayout
          node={layout}
          activePane={activePane}
          fontFamily={fontFamily}
          fontSize={fontSize}
          onPaneActivate={onPaneActivate}
          onRatioChange={onRatioChange}
        />
      </div>
    </TabVisibilityContext.Provider>
  );
}

export const TabContent = memo(TabContentComponent);
