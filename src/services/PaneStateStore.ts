import { PaneStatus } from "../types";

/**
 * ペインごとの揮発的な状態（実行ステータス・タイトル・cwd・未読出力など）を
 * 管理するストア。巨大な tabs 状態の頻繁な更新と再描画を避けるために React の外で管理する。
 *
 * React 側は `useSyncExternalStore` から参照するため、`getPaneState` /
 * `getAllStates` は「変化がなければ同一参照」を返す必要がある。
 * そのため状態オブジェクトは不変で扱い、全体スナップショットは notify 時にのみ作り直す。
 */
/** シェル統合（OSC 133）で計測したコマンド 1 回分 */
export interface CommandRun {
  paneId: string;
  command: string;
  durationMs: number;
  /** cmd は終了コードを通知できないので undefined */
  exitCode?: number;
  finishedAt: number;
}

export interface PaneVolatileState {
  status: PaneStatus;
  /** OSC 0/2 で通知されたウィンドウタイトル */
  title?: string;
  /** シェル統合（OSC 9;9 / OSC 7）で追跡したカレントディレクトリ */
  cwd?: string;
  /** 実際に起動したシェル（pwsh が無い場合のフォールバックを反映） */
  shell?: string;
  exitCode?: number | null;
  /** フォーカスされていない間に出力があった */
  activity: boolean;
  /** フォーカスされていない間にベルが鳴った */
  bell: boolean;
  /** 直前に完了したコマンド（空コマンドは除く） */
  lastCommand?: CommandRun;
  /** 実行中のコマンドと開始時刻 */
  runningCommand?: { command: string; startedAt: number };
}

type Listener = () => void;

const DEFAULT_STATE: PaneVolatileState = Object.freeze({
  status: "starting",
  activity: false,
  bell: false,
});

/** 起動直後のプロンプト描画などを「未読の出力」と見なさない猶予 */
const ACTIVITY_GRACE_MS = 1500;
const EMPTY_MRU: readonly string[] = [];

class PaneStateStore {
  private states = new Map<string, PaneVolatileState>();
  private createdAt = new Map<string, number>();
  private lastOutputAt = new Map<string, number>();
  private globalListeners = new Set<Listener>();
  private paneListeners = new Map<string, Set<Listener>>();
  private allSnapshot: Record<string, PaneVolatileState> = {};
  private focusedPaneId: string | null = null;
  /** フォーカスされた順（先頭が最新）。Ctrl+Tab の切り替え順に使う */
  private mru: readonly string[] = EMPTY_MRU;
  private commandListeners = new Set<(run: CommandRun) => void>();

  /** 特定のペインの状態を取得（未登録なら共有の既定値を返す = 参照安定） */
  getPaneState(id: string): PaneVolatileState {
    return this.states.get(id) ?? DEFAULT_STATE;
  }

  /** 全ペインの状態。変化がなければ同じ参照を返す */
  getAllStates = (): Record<string, PaneVolatileState> => this.allSnapshot;

  getMru = (): readonly string[] => this.mru;

  getLastOutputAt(id: string): number | undefined {
    return this.lastOutputAt.get(id);
  }

  /** ペインの生成を記録する（活動検知の猶予の起点） */
  register(id: string) {
    this.createdAt.set(id, Date.now());
    this.update(id, { status: "starting", exitCode: undefined, runningCommand: undefined });
  }

  /** 状態を部分更新する。実際に値が変わったときだけ通知する */
  update(id: string, patch: Partial<PaneVolatileState>) {
    const current = this.getPaneState(id);
    const changed = (Object.keys(patch) as (keyof PaneVolatileState)[]).some(
      (key) => current[key] !== patch[key]
    );
    if (!changed && this.states.has(id)) return;
    this.states.set(id, { ...current, ...patch });
    this.notify(id);
  }

  updateStatus(id: string, status: PaneStatus) {
    this.update(id, { status });
  }

  /** PTY 出力を受け取ったことを記録する（高頻度で呼ばれるため通知は状態遷移時のみ） */
  markOutput(id: string) {
    const now = Date.now();
    this.lastOutputAt.set(id, now);
    if (id === this.focusedPaneId) return;
    if (now - (this.createdAt.get(id) ?? 0) < ACTIVITY_GRACE_MS) return;
    if (!this.getPaneState(id).activity) this.update(id, { activity: true });
  }

  /** コマンドの開始を記録する */
  commandStarted(id: string, command: string, startedAt = Date.now()) {
    this.update(id, { runningCommand: command ? { command, startedAt } : undefined });
  }

  /** コマンドの完了を記録し、購読者（通知）へ知らせる */
  commandFinished(run: CommandRun) {
    this.update(run.paneId, {
      runningCommand: undefined,
      ...(run.command ? { lastCommand: run } : {}),
    });
    if (run.command) this.commandListeners.forEach((l) => l(run));
  }

  onCommandFinished(listener: (run: CommandRun) => void): () => void {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }

  markBell(id: string) {
    if (id === this.focusedPaneId) return;
    this.update(id, { bell: true });
  }

  /** フォーカス中のペインを設定する。未読フラグを消し、MRU の先頭に移す */
  setFocusedPane(id: string | null) {
    if (this.focusedPaneId === id) return;
    this.focusedPaneId = id;
    if (!id) return;
    if (this.mru[0] !== id) {
      this.mru = [id, ...this.mru.filter((p) => p !== id)];
      this.globalListeners.forEach((l) => l());
    }
    const state = this.states.get(id);
    if (state && (state.activity || state.bell)) {
      this.update(id, { activity: false, bell: false });
    }
  }

  getFocusedPane(): string | null {
    return this.focusedPaneId;
  }

  /**
   * ペインを削除（クリーンアップ）。
   * paneListeners は購読解除側が片付けるのでここでは触らない
   * （まだマウントされているコンポーネントの購読を奪わないため）。
   */
  deletePane(id: string) {
    this.createdAt.delete(id);
    this.lastOutputAt.delete(id);
    if (this.mru.includes(id)) this.mru = this.mru.filter((p) => p !== id);
    if (!this.states.delete(id)) return;
    this.notify(id);
  }

  private notify(id: string) {
    // スナップショットを作り直してから通知する（リスナーが最新値を読めるように）
    this.allSnapshot = Object.fromEntries(this.states);
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
