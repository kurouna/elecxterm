import { PaneStatus } from "../types";

interface StatusBarProps {
  paneStatuses: Record<string, PaneStatus>;
  activeTabNumber: number;
  totalTabs: number;
}

export function StatusBar({
  paneStatuses,
  activeTabNumber,
  totalTabs,
}: StatusBarProps) {
  const runningCount = Object.values(paneStatuses).filter(
    (s) => s === "running"
  ).length;

  return (
    <div className="h-7 flex-shrink-0 bg-surface-primary flex items-center justify-between px-4 text-[9px] text-text-muted border-t border-[var(--color-border-default)] select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 opacity-80">
          <div className="h-1.5 w-1.5 rounded-full bg-accent-emerald shadow-[0_0_5px_rgba(16,185,129,0.3)] animate-pulse" />
          <span className="font-medium text-text-secondary uppercase tracking-tight">
            {runningCount} Running
          </span>
        </div>
        <span className="text-[8px] opacity-20">|</span>
        <span className="opacity-80 uppercase tracking-tighter">
          Tab: {activeTabNumber} / {totalTabs}
        </span>
      </div>

      <div className="flex items-center gap-8 uppercase tracking-widest font-medium">
        <div className="flex gap-5 border-r border-[var(--color-border-default)]/30 pr-8">
          <span className="flex gap-2">
            Tab <span className="text-text-secondary font-mono">^⇧T / ←→</span>
          </span>
          <span className="flex gap-2">
            Split <span className="text-text-secondary font-mono">^⇧D / E</span>
          </span>
        </div>

        <div className="flex gap-5 border-r border-[var(--color-border-default)]/30 pr-8">
          <span className="flex gap-2">
            Pane <span className="text-text-secondary font-mono">^⇧P / N</span>
          </span>
          <span className="flex gap-2">
            Close <span className="text-text-secondary font-mono">^⇧W</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-accent-primary">
          <span className="text-[8px]">●</span>
          <span>
            Palette{" "}
            <span className="text-text-primary px-1 font-mono">^⇧K</span>
          </span>
        </div>
        
        {/* スペーサーのサイズ微調整 */}
        <div className="w-2 flex-shrink-0" />
      </div>
    </div>
  );
}
