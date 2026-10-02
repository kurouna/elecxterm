/**
 * 開発専用: Tauri の外（通常のブラウザで `npm run dev`）でも UI を動かせるよう、
 * IPC をモックして簡易的な疑似シェルを提供する。本番ビルドには含まれない
 * （main.tsx で import.meta.env.DEV かつ Tauri 外のときだけ動的 import する）。
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import type { Channel } from "@tauri-apps/api/core";

/** デモシナリオ（?demo=...）が設定していれば、その台本とホームディレクトリを使う */
const DEMO = (window as unknown as {
  __ELECXTERM_DEMO__?: { scripts: Record<string, { initial: string; later?: { delay: number; text: string }[] }>; home: string };
}).__ELECXTERM_DEMO__;
const HOME = DEMO?.home ?? "C:\\Users\\demo";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface FakeShell {
  id: string;
  shell: string;
  cwd: string;
  line: string;
  channel: Channel<ArrayBuffer>;
  timer: number | null;
  lastExit: number;
}

const shells = new Map<string, FakeShell>();
const store = new Map<string, unknown>(
  Object.entries(JSON.parse(localStorage.getItem("elecxterm-mock-store") ?? "{}"))
);

function send(sh: FakeShell, text: string) {
  sh.channel.onmessage(encoder.encode(text).buffer as ArrayBuffer);
}

function isPwsh(sh: FakeShell) {
  return /pwsh|powershell/i.test(sh.shell);
}

function prompt(sh: FakeShell) {
  // 実機のシェル統合と同じく OSC 133（コマンド境界）と OSC 9;9（cwd）を送る
  const ST = "\x1b\\";
  const marks = `\x1b]133;D;${sh.lastExit}${ST}\x1b]133;A${ST}\x1b]9;9;${sh.cwd}${ST}`;
  const text = isPwsh(sh) ? `\x1b[32mPS\x1b[0m ${sh.cwd}> ` : `${sh.cwd}>`;
  send(sh, `${marks}${text}\x1b]133;B${ST}`);
  sh.lastExit = 0;
}

function resolvePath(cwd: string, target: string): string {
  if (/^[A-Za-z]:/.test(target)) return target;
  if (target === "~") return HOME;
  const parts = cwd.split("\\");
  for (const seg of target.split(/[\\/]/)) {
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
    } else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("\\");
}

function run(sh: FakeShell, input: string) {
  const [cmd, ...args] = input.trim().split(/\s+/);
  const arg = args.join(" ");
  switch ((cmd ?? "").toLowerCase()) {
    case "":
      break;
    case "cd":
      if (arg) sh.cwd = resolvePath(sh.cwd, arg);
      else send(sh, `${sh.cwd}\r\n`);
      break;
    case "dir":
    case "ls":
      send(
        sh,
        [
          ` Directory of ${sh.cwd}`,
          "",
          "2026/10/01  09:12    <DIR>          \x1b[34msrc\x1b[0m",
          "2026/10/01  09:12    <DIR>          \x1b[34mdocs\x1b[0m",
          "2026/10/02  18:40             1,204 package.json",
          "2026/10/03  08:03             3,912 README.md",
          "               2 File(s)          5,116 bytes",
          "",
        ].join("\r\n") + "\r\n"
      );
      break;
    case "echo":
      send(sh, `${arg}\r\n`);
      break;
    case "cls":
    case "clear":
      send(sh, "\x1b[2J\x1b[3J\x1b[H");
      break;
    case "sleep": {
      // 長時間コマンドの模擬（完了通知の確認用）
      const seconds = Number(arg) || 5;
      sh.timer = window.setTimeout(() => {
        sh.timer = null;
        send(sh, `slept ${seconds}s\r\n`);
        prompt(sh);
      }, seconds * 1000);
      return;
    }
    case "fail":
      sh.lastExit = Number(arg) || 1;
      send(sh, `failing with exit code ${sh.lastExit}\r\n`);
      break;
    case "bell":
      send(sh, "\x07");
      break;
    case "colors":
      for (let i = 0; i < 8; i++) send(sh, `\x1b[3${i}m██ color ${i}  \x1b[9${i}m██ bright ${i}\x1b[0m\r\n`);
      break;
    case "ping": {
      const host = arg || "localhost";
      send(sh, `\x1b]0;${sh.shell === "cmd.exe" ? "C:\\WINDOWS\\system32\\cmd.exe - " : ""}ping ${host}\x07`);
      send(sh, `\r\nPinging ${host} [127.0.0.1] with 32 bytes of data:\r\n`);
      let n = 0;
      sh.timer = window.setInterval(() => {
        n += 1;
        send(sh, `Reply from 127.0.0.1: bytes=32 time<1ms TTL=128 (#${n})\r\n`);
        if (n >= 30) {
          window.clearInterval(sh.timer!);
          sh.timer = null;
          send(sh, `\x1b]0;${sh.shell}\x07\r\n`);
          prompt(sh);
        }
      }, 700);
      return;
    }
    case "exit":
      emit(`pty-exit-${sh.id}`, { code: Number(arg) || 0 });
      shells.delete(sh.id);
      return;
    default:
      send(sh, `'${cmd}' is not recognized as an internal or external command (mock shell).\r\nTry: dir, cd, echo, ping, sleep N, fail N, colors, bell, cls, exit\r\n`);
  }
  send(sh, "\r\n");
  prompt(sh);
}

function onInput(sh: FakeShell, data: string) {
  for (const ch of data) {
    if (sh.timer !== null) {
      if (ch === "\x03") {
        window.clearInterval(sh.timer);
        sh.timer = null;
        send(sh, `^C\x1b]0;${sh.shell}\x07\r\n`);
        prompt(sh);
      }
      continue;
    }
    if (ch === "\r") {
      send(sh, "\r\n");
      const line = sh.line;
      sh.line = "";
      run(sh, line);
    } else if (ch === "\x7f" || ch === "\b") {
      if (sh.line) {
        sh.line = sh.line.slice(0, -1);
        send(sh, "\b \b");
      }
    } else if (ch === "\x03") {
      sh.line = "";
      send(sh, "^C\r\n");
      prompt(sh);
    } else if (ch >= " ") {
      sh.line += ch;
      send(sh, ch);
    }
  }
}

/** e2e テスト（e2e/*.spec.ts）から PTY の生成・破棄を検証するための記録 */
const ipcLog: { cmd: string; id?: string; shell?: string }[] = [];

export function installTauriMock() {
  (window as unknown as { __ELECXTERM_MOCK__: unknown }).__ELECXTERM_MOCK__ = {
    /** 生きている（破棄されていない）PTY の ID */
    livePtys: () => [...shells.keys()],
    /** PTY に関わる IPC 呼び出しの履歴 */
    log: ipcLog,
  };
  mockWindows("main");
  mockIPC(
    (cmd, rawArgs) => {
      const args = (rawArgs ?? {}) as Record<string, any>;
      switch (cmd) {
        case "create_pty": {
          const { id, cwd, shell } = args.options;
          const sh: FakeShell = {
            id,
            shell: shell ?? "cmd.exe",
            cwd: cwd || HOME,
            line: "",
            channel: args.onData,
            timer: null,
            lastExit: 0,
          };
          shells.set(id, sh);
          ipcLog.push({ cmd, id, shell: sh.shell });
          // デモシナリオ（src/dev/demo.ts）では、ペインごとの台本を流す
          const script = DEMO?.scripts[id];
          if (script) {
            setTimeout(() => send(sh, script.initial), 40);
            script.later?.forEach(({ delay, text }) => setTimeout(() => send(sh, text), delay));
            return sh.shell;
          }
          setTimeout(() => {
            send(
              sh,
              isPwsh(sh)
                ? "PowerShell 7.5.0 (mock)\r\n\r\n"
                : "Microsoft Windows [Version 10.0.26200] (mock shell)\r\n(c) Microsoft Corporation. All rights reserved.\r\n\r\n"
            );
            prompt(sh);
          }, 60);
          return sh.shell;
        }
        case "write_pty": {
          const sh = shells.get(args.id);
          if (!sh) throw new Error(`PTY not found: ${args.id}`);
          onInput(sh, decoder.decode(new Uint8Array(args.data)));
          return null;
        }
        case "destroy_pty": {
          ipcLog.push({ cmd, id: args.id });
          const sh = shells.get(args.id);
          if (sh?.timer) window.clearInterval(sh.timer);
          shells.delete(args.id);
          return null;
        }
        case "resize_pty":
          return null;
        case "get_default_cwd":
          return HOME;
        case "plugin:store|load":
          return 1;
        case "plugin:store|get":
          return [store.get(args.key) ?? null, store.has(args.key)];
        case "plugin:store|set":
          store.set(args.key, args.value);
          return null;
        case "plugin:store|save":
          localStorage.setItem("elecxterm-mock-store", JSON.stringify(Object.fromEntries(store)));
          return null;
        case "plugin:window|is_maximized":
          return false;
        case "plugin:window|set_effects":
          // Mica の代わりに壁紙っぽいグラデーションを敷いて、半透明部分を確認できるようにする
          document.documentElement.style.background = args.value
            ? "linear-gradient(135deg, #1d4350 0%, #a43931 55%, #e0a96d 100%)"
            : "";
          return null;
        case "plugin:notification|is_permission_granted":
          return true;
        case "plugin:window|start_dragging":
          console.info("[mock] start_dragging");
          return null;
        case "plugin:window|request_user_attention":
          console.info("[mock] request_user_attention", args.value);
          return null;
        case "plugin:opener|open_url":
          window.open(args.url, "_blank");
          return null;
        default:
          // ウィンドウ操作などは何もしない
          return null;
      }
    },
    { shouldMockEvents: true }
  );
  console.info("[elecxterm] Running outside Tauri — IPC is mocked with a fake shell.");
}
