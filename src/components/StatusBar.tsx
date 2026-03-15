import { useAllPaneStatuses } from "../hooks/usePaneState";

interface StatusBarProps {
  activeTabNumber: number;
  totalTabs: number;
}

export function StatusBar({
  activeTabNumber,
  totalTabs,
}: StatusBarProps) {
  const paneStatuses = useAllPaneStatuses();
  const runningCount = Object.values(paneStatuses).filter(
    (s) => s === "running"
  ).length;

  return (
    <div className="h-7 flex-shrink-0 bg-bg-main flex items-center justify-between px-4 text-[9px] text-tx-muted border-t border-border-dim select-none transition-colors duration-300">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 opacity-80">
          {/* Running Indicator - Matched with Terminal ACTIVE color */}
          <div className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_5px_rgba(34,197,94,0.5)] animate-pulse" />
          <span className="font-medium text-tx-secondary uppercase tracking-tight">
            {runningCount} Running
          </span>
        </div>
        <span className="text-[8px] opacity-20 text-tx-muted">|</span>
        <span className="opacity-80 uppercase tracking-tighter">
          Tab: {activeTabNumber} / {totalTabs}
        </span>
      </div>

      {/* Right side (Hints) */}
      <div className="flex items-center gap-8 uppercase tracking-widest font-medium">
        <div className="flex gap-4">
          <span className="flex gap-1.5">
            CMD <span className="text-tx-secondary font-mono">^⇧D/E</span>
          </span>
          <span className="flex gap-1.5">
            PS <span className="text-tx-secondary font-mono">^⎇D/E</span>
          </span>
        </div>

        <div className="flex gap-5">
          <span className="flex gap-2">
            Pane <span className="text-tx-secondary font-mono">^⇧P / N</span>
          </span>
          <span className="flex gap-2">
            Close <span className="text-tx-secondary font-mono">^⇧W</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>
            Palette{" "}
            <span className="text-tx-secondary px-1 font-mono">^⇧K</span>
          </span>
        </div>
        
        {/* Spacer for corner rounding */}
        <div className="w-2 flex-shrink-0" />
      </div>
    </div>
  );
}
