import { useCallback, useSyncExternalStore } from "react";
import { paneStateStore, PaneVolatileState } from "../services/PaneStateStore";

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

/** 全ペインの状態を購読するフック（タブバー・ステータスバー・概要表示用） */
export function useAllPaneStates(): Record<string, PaneVolatileState> {
  return useSyncExternalStore(
    paneStateStore.subscribeGlobal,
    paneStateStore.getAllStates,
    paneStateStore.getAllStates
  );
}

/** フォーカス履歴（先頭が最新） */
export function usePaneMru(): readonly string[] {
  return useSyncExternalStore(
    paneStateStore.subscribeGlobal,
    paneStateStore.getMru,
    paneStateStore.getMru
  );
}
