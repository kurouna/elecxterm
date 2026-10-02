/** レイアウトツリーのノード型 */
export type LayoutNode = PaneNode | SplitNode;

/** 単一ペインのノード */
export interface PaneNode {
  type: "pane";
  id: string;
  /** 起動ディレクトリ。保存時にはシェル統合で追跡した最新の cwd に更新される */
  cwd?: string;
  shell?: string;
}

/** 分割ノード（horizontal = 左右に並ぶ / vertical = 上下に並ぶ） */
export interface SplitNode {
  id: string;
  type: "horizontal" | "vertical";
  children: LayoutNode[];
  ratio: number[];
}

/** タブ情報 */
export interface Tab {
  id: string;
  name: string;
  /** ユーザーが明示的に名前を付けたか。false の間はアクティブペインのタイトルを表示する */
  renamed?: boolean;
  layout: LayoutNode;
  activePaneId: string;
  defaultCwd?: string;
  /** アクティブペインを最大化表示しているか（tmux の zoom 相当） */
  zoomed?: boolean;
  /** ユーザーが付けたタブの識別色。未指定ならタブの順番から自動で決める */
  color?: TabColor;
}

export const TAB_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type TabColor = (typeof TAB_COLORS)[number];

export type CursorStyle = "bar" | "block" | "underline";
export type DimLevel = "off" | "subtle" | "strong";

/** 端末の見た目に関する設定（設定パネルで変更し、永続化する） */
export interface Preferences {
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /** 非アクティブペインを沈める強さ */
  dimInactive: DimLevel;
  lineHeight: number;
}

/** ペインのステータス */
export type PaneStatus = "starting" | "running" | "exited" | "error";

/** コマンドパレットのアイテム */
export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  action: () => void;
  category?: string;
  /** 検索用の追加キーワード（表示はしない） */
  keywords?: string;
}
