import { PaneStatus } from "../types";

/**
 * ペインごとの揮発的な状態（実行ステータスなど）を管理するストア。
 * 巨大な tabs 状態の頻繁な更新と再描画を避けるために React の外で管理する。
 *
 * React 側は `useSyncExternalStore` から参照するため、`getPaneState` /
 * `getAllStatuses` は「変化がなければ同一参照」を返す必要がある。
 * そのためスナップショットをキャッシュし、notify のタイミングでのみ作り直す。
 */
export interface PaneVolatileState {
  status: PaneStatus;
}

type Listener = () => void;

const DEFAULT_STATE: PaneVolatileState = Object.freeze({ status: "running" });

class PaneStateStore {
  private states = new Map<string, PaneVolatileState>();
  private globalListeners = new Set<Listener>();
  private paneListeners = new Map<string, Set<Listener>>();
  private allStatusesSnapshot: Record<string, PaneStatus> = {};

  /** 特定のペインの状態を取得（未登録なら共有の既定値を返す = 参照安定） */
  getPaneState(id: string): PaneVolatileState {
    return this.states.get(id) ?? DEFAULT_STATE;
  }

  /**
   * 全てのステータスを取得（StatusBar 用）。変化がなければ同じ参照を返す。
   * useSyncExternalStore に関数参照をそのまま渡せるようアロー関数で定義する。
   */
  getAllStatuses = (): Record<string, PaneStatus> => this.allStatusesSnapshot;

  /** ステータスを更新 */
  updateStatus(id: string, status: PaneStatus) {
    const current = this.states.get(id);
    if (current && current.status === status) return;

    this.states.set(id, { status });
    this.notify(id);
  }

  /**
   * ペインを削除（クリーンアップ）。
   * paneListeners は購読解除側が片付けるのでここでは触らない
   * （まだマウントされているコンポーネントの購読を奪わないため）。
   */
  deletePane(id: string) {
    if (!this.states.delete(id)) return;
    this.notify(id);
  }

  private notify(id: string) {
    // スナップショットを作り直してから通知する（リスナーが最新値を読めるように）
    const next: Record<string, PaneStatus> = {};
    this.states.forEach((val, key) => {
      next[key] = val.status;
    });
    this.allStatusesSnapshot = next;

    this.globalListeners.forEach((l) => l());
    this.paneListeners.get(id)?.forEach((l) => l());
  }

  /** 全体の変更を購読 */
  subscribeGlobal = (listener: Listener): (() => void) => {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  };

  /** 特定のペインの変更を購読 */
  subscribePane(id: string, listener: Listener): () => void {
    let listeners = this.paneListeners.get(id);
    if (!listeners) {
      listeners = new Set();
      this.paneListeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = this.paneListeners.get(id);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.paneListeners.delete(id);
    };
  }
}

export const paneStateStore = new PaneStateStore();
