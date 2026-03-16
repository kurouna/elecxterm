import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/** 
 * PTYの入出力をTauri IPCで管理するヘルパー
 */
class PtyBridge {
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

  /** PTYを破棄する */
  async destroy(id: string): Promise<void> {
    await invoke("destroy_pty", { id });
  }

  /** システムのカレントディレクトリを取得 */
  async getCwd(): Promise<string> {
    return await invoke<string>("get_cwd");
  }

  /** PTYの出力データをリッスン */
  async onData(
    id: string,
    callback: (data: Uint8Array) => void
  ): Promise<UnlistenFn> {
    return await listen<Uint8Array>(`pty-data-${id}`, (event) => {
      callback(event.payload);
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
