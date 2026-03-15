import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/** PTYの入出力をTauri IPCで管理するヘルパー */
export const ptyBridge = {
  /** 新しいPTYを作成 */
  async create(options: {
    id: string;
    cwd?: string;
    shell?: string;
    rows?: number;
    cols?: number;
  }): Promise<string> {
    return await invoke<string>("create_pty", { options });
  },

  /** PTYに入力を書き込む（Base64エンコード済み） */
  async write(id: string, data: string): Promise<void> {
    // 文字列をBase64にエンコード
    const encoded = btoa(
      Array.from(new TextEncoder().encode(data))
        .map((b) => String.fromCharCode(b))
        .join("")
    );
    await invoke("write_pty", { id, data: encoded });
  },

  /** PTYに生バイトを書き込む（既にBase64エンコードされたデータ） */
  async writeRaw(id: string, base64Data: string): Promise<void> {
    await invoke("write_pty", { id, data: base64Data });
  },

  /** PTYのサイズを変更 */
  async resize(id: string, rows: number, cols: number): Promise<void> {
    await invoke("resize_pty", { options: { id, rows, cols } });
  },

  /** PTYを破棄 */
  async destroy(id: string): Promise<void> {
    await invoke("destroy_pty", { id });
  },

  /** PTYの出力データをリッスン */
  async onData(
    id: string,
    callback: (data: Uint8Array) => void
  ): Promise<UnlistenFn> {
    return await listen<string>(`pty-data-${id}`, (event) => {
      // Base64デコード
      const binaryString = atob(event.payload);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      callback(bytes);
    });
  },

  /** PTYの終了イベントをリッスン */
  async onExit(id: string, callback: () => void): Promise<UnlistenFn> {
    return await listen(`pty-exit-${id}`, () => {
      callback();
    });
  },
};
