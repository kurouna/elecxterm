import { useCallback, useSyncExternalStore } from "react";
import { paneStateStore, PaneVolatileState } from "../services/PaneStateStore";
import { PaneStatus } from "../types";

/**
 * 特定のペインの揮発的な状態を購読するフック。
 * `useSyncExternalStore` を使うことで、React 外のストアと
 * 並行レンダリング下でも状態がずれない（tearing しない）。
 */
export function usePaneState(id: string): PaneVolatileState {
  const subscribe = useCallback(
    (onChange: () => void) => paneStateStore.subscribePane(id, onChange),
    [id]
  );
  const getSnapshot = useCallback(() => paneStateStore.getPaneState(id), [id]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 全てのペインのステータスを購読するフック（StatusBar 用）
 */
export function useAllPaneStatuses(): Record<string, PaneStatus> {
  return useSyncExternalStore(
    paneStateStore.subscribeGlobal,
    paneStateStore.getAllStatuses,
    paneStateStore.getAllStatuses
  );
}
