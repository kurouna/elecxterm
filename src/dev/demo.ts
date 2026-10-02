/**
 * 開発専用: README 用スクリーンショットのデモシナリオ。
 * `npm run dev` で http://localhost:1420/?demo=<scene>&theme=<dark|light> を開くと、
 * 現実的な内容のセッションを復元し、指定した画面状態（オーバービュー・パレットなど）を再現する。
 * 本番ビルドには含まれない（main.tsx で DEV かつ Tauri 外のときだけ読み込む）。
 */

export type DemoScene = "main" | "overview" | "switch" | "palette" | "settings" | "scheme";

const ST = "\x1b\\";
const HOME = "C:\\Users\\you";
const PROJECT = `${HOME}\\projects\\elecxterm`;

/** シェル統合（OSC 133 / 9;9）付きのプロンプト */
function prompt(cwd: string, pwsh: boolean, exit = 0): string {
  const text = pwsh ? `\x1b[32mPS\x1b[0m ${cwd}> ` : `${cwd}>`;
  return `\x1b]133;D;${exit}${ST}\x1b]133;A${ST}\x1b]9;9;${cwd}${ST}${text}\x1b]133;B${ST}`;
}

/** コマンドを打って出力が出た状態（C = 実行開始） */
function run(cwd: string, pwsh: boolean, command: string, output: string[]): string {
  return `${prompt(cwd, pwsh)}${command}\r\n\x1b]133;C${ST}${output.join("\r\n")}\r\n`;
}

const c = {
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bgreen: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface DemoScript {
  /** 起動直後に流す内容 */
  initial: string;
  /** 少し後に流す内容（裏のペインの「新しい出力」表示を出すため） */
  later?: { delay: number; text: string }[];
}

const SCRIPTS: Record<string, DemoScript> = {
  "pane-dev": {
    initial:
      `\x1b]0;npm run dev\x07` +
      run(PROJECT, true, "npm run dev", [
        "",
        `> elecxterm@0.0.18 dev`,
        `> vite`,
        "",
        `  ${c.bgreen("VITE")} ${c.green("v8.2.2")}  ${c.dim("ready in")} ${c.bold("412")} ${c.dim("ms")}`,
        "",
        `  ${c.green("➜")}  ${c.bold("Local")}:   ${c.cyan("http://localhost:1420/")}`,
        `  ${c.green("➜")}  ${c.dim("Network")}: ${c.dim("use --host to expose")}`,
        `  ${c.green("➜")}  ${c.dim("press")} ${c.bold("h + enter")} ${c.dim("to show help")}`,
        "",
        `${c.dim("10:42:18")} ${c.cyan("[vite]")} ${c.green("hmr update")} ${c.dim("/src/components/PaneOverview.tsx")}`,
        `${c.dim("10:42:31")} ${c.cyan("[vite]")} ${c.green("hmr update")} ${c.dim("/src/components/TitleBar.tsx, /src/index.css")}`,
        `${c.dim("10:43:02")} ${c.cyan("[vite]")} ${c.green("hmr update")} ${c.dim("/src/components/SettingsPanel.tsx")}`,
      ]),
  },
  "pane-git": {
    initial:
      run(PROJECT, false, "git log --oneline -4", [
        `${c.yellow("972cfdc")} ${c.cyan("(HEAD -> main, tag: v0.0.18)")} build(deps): bump tauri`,
        `${c.yellow("a0bef45")} feat(ux): confirm closing running commands`,
        `${c.yellow("3772fe6")} feat: command completion notifications`,
        `${c.yellow("c5d5e81")} feat(ui): pane overview & quick switch`,
      ]) +
      run(PROJECT, false, "git status -sb", [
        `## ${c.green("main")}...${c.red("origin/main")}`,
        ` ${c.red("M")} README.md`,
        `${c.red("??")} docs/screenshots/`,
      ]) +
      prompt(PROJECT, false),
  },
  "pane-test": {
    initial:
      run(`${PROJECT}\\src-tauri`, true, "cargo test", [
        `    ${c.bgreen("Finished")} \`test\` profile in 8.41s`,
        `     ${c.bgreen("Running")} unittests src\\lib.rs`,
        "",
        "running 4 tests",
        `test pty_manager::tests::shell_name_matching ... ${c.green("ok")}`,
        `test pty_manager::tests::base64_matches_reference ... ${c.green("ok")}`,
        `test pty_manager::tests::cmd_emits_shell_integration_sequences ... ${c.green("ok")}`,
        `test pty_manager::tests::powershell_reports_exit_code ... ${c.green("ok")}`,
        "",
        `test result: ${c.green("ok")}. 4 passed; 0 failed; finished in 5.05s`,
      ]) + prompt(`${PROJECT}\\src-tauri`, true),
  },
  "pane-api": {
    initial:
      `\x1b]0;docker compose up\x07` +
      run(`${HOME}\\projects\\api-server`, true, "docker compose up", [
        `${c.cyan("api-1")}    | ${c.green("INFO")}  Server listening on http://0.0.0.0:8080`,
        `${c.cyan("api-1")}    | ${c.green("INFO")}  Connected to postgres (pool size 10)`,
        `${c.magenta("db-1")}     | LOG:  database system is ready to accept connections`,
        `${c.cyan("api-1")}    | ${c.green("INFO")}  GET  /health          200   1.2ms`,
        `${c.cyan("api-1")}    | ${c.green("INFO")}  GET  /api/v1/sessions 200  14.8ms`,
      ]),
    later: [
      { delay: 2200, text: `${c.cyan("api-1")}    | ${c.green("INFO")}  POST /api/v1/panes    201  22.4ms\r\n` },
      { delay: 2600, text: `${c.cyan("api-1")}    | ${c.yellow("WARN")}  slow query (312ms): SELECT * FROM events\r\n` },
    ],
  },
  "pane-logs": {
    initial:
      run(`${HOME}\\projects\\api-server`, false, "type logs\\deploy.log", [
        "[2026-10-02 21:58:04] build started (release)",
        "[2026-10-02 21:59:16] build finished in 1m 12s",
        "[2026-10-02 21:59:18] deploying to staging ...",
        `[2026-10-02 21:59:31] ${c.green("deployed")} api-server@1.8.0`,
      ]) + prompt(`${HOME}\\projects\\api-server`, false),
  },
  "pane-docs": {
    initial:
      run(`${HOME}\\Documents\\メモ`, false, "dir", [
        " ドライブ C のボリューム ラベルがありません。",
        ` ${HOME}\\Documents\\メモ のディレクトリ`,
        "",
        "2026/10/01  09:12    <DIR>          .",
        "2026/10/02  18:40             2,148 リリースノート_v0.0.18.md",
        "2026/10/02  22:31             4,912 設計メモ_ペイン一覧.md",
        "2026/10/03  08:03             1,307 ショートカット案.txt",
        "               3 個のファイル               8,367 バイト",
      ]) + prompt(`${HOME}\\Documents\\メモ`, false),
  },
};

function tabsFor(): unknown[] {
  return [
    {
      id: "tab-main",
      name: "elecxterm",
      renamed: true,
      color: "blue",
      activePaneId: "pane-git",
      defaultCwd: PROJECT,
      layout: {
        id: "split-root",
        type: "horizontal",
        ratio: [0.52, 0.48],
        children: [
          { type: "pane", id: "pane-dev", shell: "pwsh.exe", cwd: PROJECT },
          {
            id: "split-right",
            type: "vertical",
            ratio: [0.5, 0.5],
            children: [
              { type: "pane", id: "pane-git", shell: "cmd.exe", cwd: PROJECT },
              { type: "pane", id: "pane-test", shell: "pwsh.exe", cwd: `${PROJECT}\\src-tauri` },
            ],
          },
        ],
      },
    },
    {
      id: "tab-api",
      name: "api-server",
      renamed: true,
      color: "green",
      activePaneId: "pane-api",
      layout: {
        id: "split-api",
        type: "vertical",
        ratio: [0.62, 0.38],
        children: [
          { type: "pane", id: "pane-api", shell: "pwsh.exe", cwd: `${HOME}\\projects\\api-server` },
          { type: "pane", id: "pane-logs", shell: "cmd.exe", cwd: `${HOME}\\projects\\api-server` },
        ],
      },
    },
    {
      id: "tab-docs",
      name: "メモ",
      renamed: true,
      color: "purple",
      activePaneId: "pane-docs",
      layout: { type: "pane", id: "pane-docs", shell: "cmd.exe", cwd: `${HOME}\\Documents\\メモ` },
    },
  ];
}

export interface DemoConfig {
  scene: DemoScene;
}

/** モックの永続化ストアとブラウザ設定を、IPC モックより先に用意する */
export function seedDemo(params: URLSearchParams): DemoConfig {
  const scene = (params.get("demo") || "main") as DemoScene;
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const store = {
    tabs: tabsFor(),
    activeTabId: "tab-main",
    fontSize: 14,
    showPaneHeaders: true,
    preferences: {
      cursorStyle: "bar",
      cursorBlink: false,
      dimInactive: "subtle",
      lineHeight: 1.3,
      colorScheme: scene === "scheme" ? "catppuccin" : "elecxterm",
      windowMaterial: "solid",
      notifyAfterSeconds: 10,
    },
  };
  localStorage.setItem("elecxterm-mock-store", JSON.stringify(store));
  localStorage.setItem("elecxterm-theme", theme);
  localStorage.setItem("elecxterm-welcomed", "1");
  localStorage.removeItem("elecxterm-palette-recent");
  (window as unknown as { __ELECXTERM_DEMO__: unknown }).__ELECXTERM_DEMO__ = { scripts: SCRIPTS, home: HOME };
  return { scene };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function key(type: "keydown" | "keyup", init: KeyboardEventInit) {
  (document.activeElement ?? window).dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
}

function typeInto(input: HTMLInputElement | null, text: string) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 画面状態を再現する（アプリの描画後に呼ぶ） */
export async function playDemo({ scene }: DemoConfig) {
  await wait(1600);
  switch (scene) {
    case "main": {
      // 裏のタブで長いビルドが終わった通知
      const { paneStateStore } = await import("../services/PaneStateStore");
      paneStateStore.commandFinished({
        paneId: "pane-logs",
        command: "cargo build --release",
        durationMs: 72_000,
        exitCode: 0,
        finishedAt: Date.now(),
      });
      break;
    }
    case "overview":
      key("keydown", { key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
      await wait(300);
      key("keydown", { key: "ArrowRight", code: "ArrowRight" });
      break;
    case "switch":
      key("keydown", { key: "Control", code: "ControlLeft", ctrlKey: true });
      key("keydown", { key: "Tab", code: "Tab", ctrlKey: true });
      break;
    case "palette":
      key("keydown", { key: "K", code: "KeyK", ctrlKey: true, shiftKey: true });
      await wait(250);
      typeInto(document.querySelector<HTMLInputElement>('input[aria-label="Search commands"]'), "split");
      break;
    case "settings":
      key("keydown", { key: ">", code: "Period", ctrlKey: true, shiftKey: true });
      await wait(300);
      document.querySelector('[aria-label="Settings"] .overflow-y-auto')?.scrollTo({ top: 360 });
      break;
    case "scheme":
      break;
  }
}
