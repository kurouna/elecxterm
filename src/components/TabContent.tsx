import { createContext, useContext } from "react";
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

export function TabContent({
  layout,
  activePane,
  isActive,
  fontFamily,
  fontSize,
  onPaneActivate,
  onRatioChange,
}: TabContentProps) {
  return (
    <TabVisibilityContext.Provider value={{ isActive }}>
      <div
        className={`absolute inset-0 p-0.5 transition-all duration-300 ${
          isActive
            ? "opacity-100 z-10 translate-y-0 scale-100 visible pointer-events-auto"
            : "opacity-0 z-0 translate-y-2 scale-[0.99] invisible pointer-events-none"
        }`}
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
