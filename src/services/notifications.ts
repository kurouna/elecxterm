import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";

/** "1m 05s" のような所要時間の表記 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

let permission: Promise<boolean> | null = null;

/** 通知の許可を一度だけ確認する（拒否されたら以降は OS 通知を送らない） */
function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    try {
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === "granted";
    } catch {
      return false;
    }
  })();
  return permission;
}

/**
 * ウィンドウが裏にあるときの通知。OS のトースト通知を出し、
 * タスクバーのアイコンも点滅させて気付けるようにする。
 */
export async function notifyInBackground(title: string, body: string) {
  getCurrentWindow()
    .requestUserAttention(UserAttentionType.Informational)
    .catch(() => {});
  if (await ensurePermission()) {
    try {
      sendNotification({ title, body });
    } catch {
      // 通知できない環境では点滅だけにとどめる
    }
  }
}
