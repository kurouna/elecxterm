import { Bell, Copy, Keyboard, Maximize2 } from "lucide-react";
import { PaneNode } from "../types";
import { useAllPaneStates } from "../hooks/usePaneState";
import { shortenPath } from "../services/paneInfo";
import { KEYS } from "../keymap";
import { ShellBadge, StatusDot } from "./ui";

interface StatusBarProps {
  activePane: PaneNode | undefined;
  zoomed: boolean;
  totalPanes: number;
  maxPanes: number;
  fontSize: number;
  homeDir?: string;
  onShowHelp: () => void;
  onShowOverview: () => void;
  onToggleZoom: () => void;
  onCopyPath: (path: string) => void;
}

export function StatusBar({
  activePane,
  zoomed,
  totalPanes,
  maxPanes,
  fontSize,
  homeDir,
  onShowHelp,
  onShowOverview,
  onToggleZoom,
  onCopyPath,
}: StatusBarProps) {
  const states = useAllPaneStates();
  const values = Object.values(states);
  const running = values.filter((s) => s.status === "running").length;
  // 他のペインで起きた「見ておくべきこと」（未読出力・ベル）
  const attention = values.filter((s) => s.activity || s.bell).length;
  const bells = values.filter((s) => s.bell).length;
  const state = activePane ? states[activePane.id] : undefined;
  const cwd = state?.cwd ?? activePane?.cwd;
  // 上限が近いことを事前に知らせる（超えてから通知されるより親切）
  const nearLimit = totalPanes >= maxPanes - 2;

  return (
    <div className="flex h-[26px] shrink-0 select-none items-center gap-3 border-t border-border-dim bg-bg-chrome px-3 text-[11px] text-tx-muted">
      {/* 左: アクティブペインの情報 */}
      {activePane && (
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={state?.status ?? "starting"} />
          <ShellBadge shell={state?.shell ?? activePane.shell} />
          {cwd && (
            <button
              type="button"
              onClick={() => onCopyPath(cwd)}
              title="Copy path"
              className="group flex min-w-0 items-center gap-1.5 rounded px-1 font-mono text-[10.5px] text-tx-secondary hover:bg-tx-primary/[0.06]"
            >
              <span className="truncate">{shortenPath(cwd, homeDir)}</span>
              <Copy size={10} className="shrink-0 opacity-0 group-hover:opacity-70" />
            </button>
          )}
        </div>
      )}

      {zoomed && (
        <button
          type="button"
          onClick={onToggleZoom}
          title={`Restore layout (${KEYS.zoom})`}
          className="flex shrink-0 items-center gap-1 rounded bg-accent-dim px-1.5 py-px font-medium text-accent"
        >
          <Maximize2 size={10} /> Zoomed
        </button>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {attention > 0 && (
          <button
            type="button"
            onClick={onShowOverview}
            title={`Panes with unseen output — open overview (${KEYS.overview})`}
            className="flex items-center gap-1.5 rounded px-1 text-accent hover:bg-accent-dim"
          >
            {bells > 0 ? <Bell size={11} className="text-warning" /> : <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            {attention} updated
          </button>
        )}
        <span title="Running shells">{running} running</span>
        <button
          type="button"
          onClick={onShowOverview}
          title={`Panes across all tabs (max ${maxPanes}) — ${KEYS.overview}`}
          className={`rounded px-1 tabular-nums hover:bg-tx-primary/[0.06] ${nearLimit ? "text-warning" : ""}`}
        >
          Panes {totalPanes}/{maxPanes}
        </button>
        <span className="tabular-nums" title={`Font size (${KEYS.fontUp} / ${KEYS.fontDown})`}>
          {fontSize}px
        </span>
        <button
          type="button"
          onClick={onShowHelp}
          title={`Keyboard shortcuts (${KEYS.help})`}
          className="flex items-center gap-1 rounded px-1 hover:bg-tx-primary/[0.06] hover:text-tx-primary"
        >
          <Keyboard size={12} /> Shortcuts
        </button>
      </div>
    </div>
  );
}
