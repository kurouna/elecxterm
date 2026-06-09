import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/**
 * PTYの入出力をTauri IPCで管理するヘルパー
 */
class PtyBridge {
  /**
   * 新しいPTYを作成（Idempotent: 既に存在すれば何もしない）。
   * 出力は Tauri の Channel（生バイト経路）で受け取る。`onData` には
   * ArrayBuffer が届くため Uint8Array に変換して渡す。
   * 戻り値はデータ購読を停止する dispose 関数。
   */
  async create(
    options: {
      id: string;
      cwd?: string;
      shell?: string;
      rows?: number;
      cols?: number;
    },
    onData: (data: Uint8Array) => void
  ): Promise<() => void> {
    const channel = new Channel<ArrayBuffer>();
    let active = true;
    channel.onmessage = (message) => {
      if (active) onData(new Uint8Array(message));
    };
    await invoke<string>("create_pty", { options, onData: channel });
    return () => {
      active = false;
      // コールバックを差し替えて、捕捉している onData(=Terminal) 参照を即座に解放する。
      // Channel 自体の登録解除は、PTY 終了時に Rust 側 Drop が送る end 通知で行われる。
      channel.onmessage = () => {};
    };
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

  /** PTYの終了イベントをリッスン */
  async onExit(id: string, callback: () => void): Promise<UnlistenFn> {
    return await listen(`pty-exit-${id}`, () => {
      callback();
    });
  }
}

export const ptyBridge = new PtyBridge();
