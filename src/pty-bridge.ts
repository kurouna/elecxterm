import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/** 
 * PTYの入出力をTauri IPCで管理するヘルパー
 * 状態を持つことで、重複したリスナー登録を防止する
 */
class PtyBridge {
  private listeners = new Map<string, Promise<UnlistenFn>>();
  private exitListeners = new Map<string, Promise<UnlistenFn>>();

  /** 新しいPTYを作成（Idempotent: 既に存在すれば何もしない） */
  async create(options: {
    id: string;
    cwd?: string;
    shell?: string;
    rows?: number;
    cols?: number;
  }): Promise<string> {
    return await invoke<string>("create_pty", { options });
  }

  /** PTYに入力を書き込む */
  async write(id: string, data: string): Promise<void> {
    const bytes = new TextEncoder().encode(data);
    await invoke("write_pty", { id, data: bytes });
  }

  /** PTYのサイズを変更 */
  async resize(id: string, rows: number, cols: number): Promise<void> {
    await invoke("resize_pty", { options: { id, rows, cols } });
  }

  /** PTYを破棄し、リスナーも解除する */
  async destroy(id: string): Promise<void> {
    // リスナーのクリーンアップ
    const unlistenData = await this.listeners.get(id);
    if (unlistenData) {
      unlistenData();
      this.listeners.delete(id);
    }
    const unlistenExit = await this.exitListeners.get(id);
    if (unlistenExit) {
      unlistenExit();
      this.exitListeners.delete(id);
    }
    
    await invoke("destroy_pty", { id });
  }

  /** システムのカレントディレクトリを取得 */
  async getCwd(): Promise<string> {
    return await invoke<string>("get_cwd");
  }

  /** 
   * PTYの出力データをリッスン
   * 既にそのIDをリッスン中の場合は新しいリスナーを作らない
   */
  async onData(
    id: string,
    callback: (data: Uint8Array) => void
  ): Promise<UnlistenFn> {
    // 既存のリスニング処理があればそれを維持しつつ、新しいコールバックに切り替えるなどはせず、
    // 重複登録のみを防止する。実際には TerminalPane の useEffect クリーンアップで解除される。
    return await listen<string>(`pty-data-${id}`, (event) => {
      const binaryString = atob(event.payload);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      callback(bytes);
    });
  }

  /** PTYの終了イベントをリッスン */
  async onExit(id: string, callback: () => void): Promise<UnlistenFn> {
    return await listen(`pty-exit-${id}`, () => {
      callback();
    });
  }
}

export const ptyBridge = new PtyBridge();
