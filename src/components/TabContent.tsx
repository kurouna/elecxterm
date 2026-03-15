import { SplitLayout } from "./SplitLayout";
import { LayoutNode, PaneStatus } from "../types";

interface TabContentProps {
  layout: LayoutNode;
  activePane: string;
  isActive: boolean;
  onPaneActivate: (id: string) => void;
  onPaneStatusChange: (id: string, status: PaneStatus) => void;
  onPaneCwdChange: (id: string, cwd: string) => void;
  onRatioChange: (path: number[], ratios: number[]) => void;
}

export function TabContent({
  layout,
  activePane,
  isActive,
  onPaneActivate,
  onPaneStatusChange,
  onPaneCwdChange,
  onRatioChange,
}: TabContentProps) {
  return (
    <div
      className={`absolute inset-0 p-0.5 transition-all duration-300 ${
        isActive 
          ? "opacity-100 z-10 translate-y-0 scale-100" 
          : "opacity-0 z-0 pointer-events-none translate-y-2 scale-[0.99]"
      }`}
    >
      <SplitLayout
        node={layout}
        activePane={activePane}
        onPaneActivate={onPaneActivate}
        onPaneStatusChange={onPaneStatusChange}
        onPaneCwdChange={onPaneCwdChange}
        onRatioChange={onRatioChange}
      />
    </div>
  );
}
