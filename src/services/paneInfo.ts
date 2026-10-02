import { LayoutNode, PaneNode, Tab } from "../types";
import { PaneVolatileState } from "./PaneStateStore";

/**
 * ペインの表示用情報（タイトル・シェル種別・パス表記）を導出する純粋関数群。
 * タブバー・ペインヘッダー・概要表示・ステータスバーで同じ規則を使うために一箇所にまとめる。
 */

export type ShellKind = "cmd" | "pwsh" | "powershell" | "other";

export function shellKind(shell?: string): ShellKind {
  const name = (shell ?? "").split(/[\\/]/).pop()?.toLowerCase().replace(/\.exe$/, "") ?? "";
  if (name === "cmd") return "cmd";
  if (name === "pwsh") return "pwsh";
  if (name === "powershell") return "powershell";
  return "other";
}

/** シェルの短いラベル（バッジ表示用） */
export function shellLabel(shell?: string): string {
  switch (shellKind(shell)) {
    case "cmd":
      return "CMD";
    case "pwsh":
      return "PS7";
    case "powershell":
      return "PS";
    default:
      return (shell ?? "sh").replace(/\.exe$/i, "").toUpperCase().slice(0, 4);
  }
}

/** パスの末尾要素（ドライブ直下は "C:\" のまま） */
export function basename(path?: string): string {
  if (!path) return "";
  const trimmed = path.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}\\`;
  return trimmed.split(/[\\/]/).pop() || path;
}

/** ホームディレクトリ配下を `~` に縮めた表記 */
export function shortenPath(path: string | undefined, home: string | undefined): string {
  if (!path) return "";
  if (home && path.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

/**
 * シェル既定のタイトル（実行ファイルのパスなど）は情報量が無いので除外し、
 * cmd の「C:\...\cmd.exe - ping localhost」のような形式からはコマンド部分を取り出す。
 */
function meaningfulTitle(title?: string): string | undefined {
  if (!title) return undefined;
  let t = title.replace(/^(Administrator|管理者):\s*/i, "").trim();
  const dash = t.match(/\\(?:cmd|pwsh|powershell)\.exe\s+-\s+(.+)$/i);
  if (dash) t = dash[1].trim();
  if (!t) return undefined;
  if (/(^|\\)(cmd|pwsh|powershell)(\.exe)?$/i.test(t)) return undefined;
  if (/^(Windows )?PowerShell( \d.*)?$/i.test(t)) return undefined;
  return t;
}

/** ペインの表示タイトル: 意味のある OSC タイトル > cwd の末尾 > シェル名 */
export function paneTitle(pane: PaneNode | undefined, state: PaneVolatileState | undefined): string {
  return (
    meaningfulTitle(state?.title) ||
    basename(state?.cwd ?? pane?.cwd) ||
    shellLabel(state?.shell ?? pane?.shell)
  );
}

/** ノード配下のペインを走査する（表示順 = 前順） */
export function forEachPane(node: LayoutNode, visit: (pane: PaneNode) => void): void {
  if (node.type === "pane") {
    visit(node);
    return;
  }
  node.children.forEach((child) => forEachPane(child, visit));
}

export function collectPanes(node: LayoutNode): PaneNode[] {
  const panes: PaneNode[] = [];
  forEachPane(node, (pane) => panes.push(pane));
  return panes;
}

export function collectPaneIds(node: LayoutNode): string[] {
  return collectPanes(node).map((pane) => pane.id);
}

export function findPane(node: LayoutNode, id: string): PaneNode | undefined {
  return collectPanes(node).find((pane) => pane.id === id);
}

/** タブの表示名: ユーザーが命名していなければアクティブペインのタイトルに追従する */
export function tabTitle(tab: Tab, states: Record<string, PaneVolatileState>): string {
  if (tab.renamed) return tab.name;
  const pane = findPane(tab.layout, tab.activePaneId);
  return pane ? paneTitle(pane, states[pane.id]) : tab.name;
}

/** 正規化座標 (0..1) でのペインの矩形。概要表示のミニマップに使う */
export interface PaneRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function layoutRects(node: LayoutNode, x = 0, y = 0, w = 1, h = 1): PaneRect[] {
  if (node.type === "pane") return [{ id: node.id, x, y, w, h }];
  const rects: PaneRect[] = [];
  let offset = 0;
  node.children.forEach((child, i) => {
    const r = node.ratio[i] ?? 1 / node.children.length;
    if (node.type === "horizontal") {
      rects.push(...layoutRects(child, x + offset * w, y, r * w, h));
    } else {
      rects.push(...layoutRects(child, x, y + offset * h, w, r * h));
    }
    offset += r;
  });
  return rects;
}

/** 「3 秒前」のような相対時刻 */
export function relativeTime(ms: number | undefined, now = Date.now()): string {
  if (!ms) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
