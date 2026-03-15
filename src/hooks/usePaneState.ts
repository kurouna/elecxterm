import { useState, useEffect, useCallback } from "react";
import { paneStateStore, PaneVolatileState } from "../services/PaneStateStore";
import { PaneStatus } from "../types";

/**
 * 特定のペインの揮発的な状態（CWD, Status）を購読するフック
 */
export function usePaneState(id: string) {
  const [state, setState] = useState<PaneVolatileState>(() => paneStateStore.getPaneState(id));

  useEffect(() => {
    // 初期状態の同期
    setState(paneStateStore.getPaneState(id));

    // 変更の購読
    return paneStateStore.subscribePane(id, (newState) => {
      setState(newState);
    });
  }, [id]);

  return state;
}

/**
 * 全てのペインのステータスを購読するフック（StatusBar用）
 */
export function useAllPaneStatuses() {
  const [statuses, setStatuses] = useState<Record<string, PaneStatus>>(() => paneStateStore.getAllStatuses());

  useEffect(() => {
    return paneStateStore.subscribeGlobal(() => {
      setStatuses(paneStateStore.getAllStatuses());
    });
  }, []);

  return statuses;
}

/**
 * ペインの状態を更新するための関数を提供するフック
 */
export function usePaneStateActions() {
  const updateCwd = useCallback((id: string, cwd: string) => {
    paneStateStore.updateCwd(id, cwd);
  }, []);

  const updateStatus = useCallback((id: string, status: PaneStatus) => {
    paneStateStore.updateStatus(id, status);
  }, []);

  const deletePane = useCallback((id: string) => {
    paneStateStore.deletePane(id);
  }, []);

  return { updateCwd, updateStatus, deletePane };
}
