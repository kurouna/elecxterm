import { PaneStatus } from "../types";

/**
 * ペインごとの揮発的な状態（CWD、実行ステータスなど）を管理するストア
 * 巨大な tabs 状態の頻繁な更新と再描画を避けるために React の外で管理する
 */
export interface PaneVolatileState {
  status: PaneStatus;
}

type Listener = () => void;
type PaneListener = (state: PaneVolatileState) => void;

class PaneStateStore {
  private states = new Map<string, PaneVolatileState>();
  private globalListeners = new Set<Listener>();
  private paneListeners = new Map<string, Set<PaneListener>>();

  /** 特定のペインの状態を取得 */
  getPaneState(id: string): PaneVolatileState {
    return this.states.get(id) || { status: "running" };
  }

  /** 全てのステータスを取得（StatusBar用など） */
  getAllStatuses(): Record<string, PaneStatus> {
    const res: Record<string, PaneStatus> = {};
    this.states.forEach((val, key) => {
      res[key] = val.status;
    });
    return res;
  }


  /** ステータスを更新 */
  updateStatus(id: string, status: PaneStatus) {
    const current = this.getPaneState(id);
    if (current.status === status) return;

    this.states.set(id, { ...current, status });
    this.notify(id);
  }

  /** ペインを削除（クリーンアップ） */
  deletePane(id: string) {
    if (this.states.has(id)) {
      this.states.delete(id);
      this.notify(id);
    }
  }

  private notify(id: string) {
    // グローバルリスナー（StatusBarなど全体に関心があるもの）に通知
    this.globalListeners.forEach(l => l());

    // 特定のペインに関心があるリスナーに通知
    const listeners = this.paneListeners.get(id);
    if (listeners) {
      const state = this.getPaneState(id);
      listeners.forEach(l => l(state));
    }
  }

  /** 全体の変更を購読 */
  subscribeGlobal(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /** 特定のペインの変更を購読 */
  subscribePane(id: string, listener: PaneListener): () => void {
    if (!this.paneListeners.has(id)) {
      this.paneListeners.set(id, new Set());
    }
    this.paneListeners.get(id)!.add(listener);
    return () => {
      const listeners = this.paneListeners.get(id);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) this.paneListeners.delete(id);
      }
    };
  }
}

export const paneStateStore = new PaneStateStore();
