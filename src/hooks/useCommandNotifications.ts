import { useEffect, useRef } from "react";
import { Tab } from "../types";
import { paneStateStore } from "../services/PaneStateStore";
import { findPane, tabTitle } from "../services/paneInfo";
import { formatDuration, notifyInBackground } from "../services/notifications";
import type { ToastAction, ToastType } from "../components/NotificationOverlay";

interface Options {
  /** この秒数以上かかったコマンドを通知する（0 = 通知しない） */
  thresholdSeconds: number;
  tabs: Tab[];
  notify: (message: string, type: ToastType, extra?: { detail?: string; action?: ToastAction }) => void;
  focusPane: (paneId: string) => void;
}

/**
 * 長時間コマンドの完了通知。
 * - そのペインを見ている（ウィンドウもペインもフォーカス中）なら何もしない
 * - アプリは前面だが別のペインを見ている → アプリ内トースト（「表示」で移動）
 * - ウィンドウが裏にある → OS 通知 + タスクバー点滅（戻ったときのためにトーストも残す）
 */
export function useCommandNotifications(options: Options) {
  const ref = useRef(options);
  ref.current = options;

  useEffect(
    () =>
      paneStateStore.onCommandFinished((run) => {
        const { thresholdSeconds, tabs, notify, focusPane } = ref.current;
        if (thresholdSeconds <= 0 || run.durationMs < thresholdSeconds * 1000) return;

        const windowFocused = document.hasFocus();
        if (windowFocused && paneStateStore.getFocusedPane() === run.paneId) return;

        const ok = run.exitCode === undefined || run.exitCode === 0;
        const title = ok ? "Command finished" : `Command failed (exit ${run.exitCode})`;
        const tab = tabs.find((t) => findPane(t.layout, run.paneId));
        const where = tab ? tabTitle(tab, paneStateStore.getAllStates()) : "";
        const detail = [run.command, formatDuration(run.durationMs), where].filter(Boolean).join(" · ");

        notify(title, ok ? "success" : "error", {
          detail,
          action: { label: "Show", run: () => focusPane(run.paneId) },
        });
        if (!windowFocused) void notifyInBackground(title, detail);
      }),
    []
  );
}
