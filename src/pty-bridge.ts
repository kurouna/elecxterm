import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface PtyCreateOptions {
  id: string;
  cwd?: string;
  shell?: string;
  rows?: number;
  cols?: number;
}

/**
 * PTYの入出力をTauri IPCで管理するヘルパー
 */
class PtyBridge {
  /**
   * ペインごとの書き込みチェーン。Tauri の async コマンドは並行実行されるため、
   * 連続する write の到達順序は IPC 層では保証されない。xterm.js は送信順序が
   * 保証されたトランスポートを前提とするので、ここで Promise チェーンにより
   * 直列化して順序を保証する（IME の連続確定などで顕在化する）。
   */
  private writeChains = new Map<string, Promise<void>>();
  private encoder = new TextEncoder();

  /**
   * 新しいPTYを作成する。出力は Tauri の Channel（生バイト経路）で受け取る。
   * 戻り値は実際に起動したシェル名と、データ購読を停止する dispose 関数。
   */
  async create(
    options: PtyCreateOptions,
    onData: (data: Uint8Array) => void
  ): Promise<{ shell: string; dispose: () => void }> {
    const channel = new Channel<ArrayBuffer>();
    let active = true;
    channel.onmessage = (message) => {
      if (active) onData(new Uint8Array(message));
    };
    const dispose = () => {
      active = false;
      // コールバックを差し替えて、捕捉している onData(=Terminal) 参照を即座に解放する。
      // Channel 自体の登録解除は、PTY 終了時に Rust 側 Drop が送る end 通知で行われる。
      channel.onmessage = () => {};
    };
    try {
      const shell = await invoke<string>("create_pty", { options, onData: channel });
      return { shell, dispose };
    } catch (e) {
      dispose();
      throw e;
    }
  }

  /** PTYに入力を書き込む（同一ペインへの書き込みは直列化される） */
  write(id: string, data: string): Promise<void> {
    const bytes = this.encoder.encode(data);
    const prev = this.writeChains.get(id) ?? Promise.resolve();
    const next = prev.then(() => invoke<void>("write_pty", { id, data: bytes }));
    // 失敗してもチェーンを止めず、痕跡だけ残す（呼び出し元には next で伝播する）
    this.writeChains.set(
      id,
      next.catch((e) => {
        console.warn(`write_pty(${id}) failed:`, e);
      })
    );
    return next;
  }

  /** PTYのサイズを変更 */
  async resize(id: string, rows: number, cols: number): Promise<void> {
    await invoke("resize_pty", { options: { id, rows, cols } });
  }

  /** PTYを破棄する */
  async destroy(id: string): Promise<void> {
    this.writeChains.delete(id);
    await invoke("destroy_pty", { id });
  }

  /** 開始ディレクトリ未指定時の既定値（ホームディレクトリ） */
  getDefaultCwd(): Promise<string> {
    return invoke<string>("get_default_cwd");
  }

  /** PTYの終了イベントをリッスン。終了コードが取れない場合は null */
  onExit(id: string, callback: (code: number | null) => void): Promise<UnlistenFn> {
    return listen<{ code?: number | null } | null>(`pty-exit-${id}`, (event) => {
      callback(event.payload?.code ?? null);
    });
  }
}

export const ptyBridge = new PtyBridge();
