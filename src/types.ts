/** レイアウトツリーのノード型 */
export type LayoutNode = PaneNode | SplitNode;

/** 単一ペインのノード */
export interface PaneNode {
  type: "pane";
  id: string;
  cwd?: string;
  shell?: string;
  command?: string;
}

/** 分割ノード（horizontal / vertical） */
export interface SplitNode {
  id: string; // レイアウトキーの安定化のために追加
  type: "horizontal" | "vertical";
  children: LayoutNode[];
  ratio: number[];
}

/** タブ情報 */
export interface Tab {
  id: string;
  name: string;
  layout: LayoutNode;
  activePaneId: string;
}

/** セッション情報 */
export interface Session {
  id: string;
  name: string;
  tabs: Tab[];
  activeTabId: string;
}

/** セッション管理の最上位データ */
export interface SessionStore {
  sessions: Session[];
  lastActiveSession: string;
}

/** ペインのステータス */
export type PaneStatus = "running" | "exited" | "error";

/** ペインの状態情報 */
export interface PaneState {
  id: string;
  status: PaneStatus;
}

/** コマンドパレットのアイテム */
export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  action: () => void;
  category?: string;
}
