import { createContext, useContext } from "react";
import type { ITheme } from "@xterm/xterm";
import type { SplitDirection } from "../hooks/useLayout";
import type { Preferences } from "../types";

/**
 * ペイン群へ配る操作と設定。SplitLayout の再帰を通して props で
 * バケツリレーすると memo の比較対象が増えるため Context で渡す。
 * 操作（参照が安定）と見た目（まれに変わる）を分け、不要な再描画を避ける。
 */
export interface PaneActions {
  focusPane: (paneId: string) => void;
  splitPane: (paneId: string, direction: SplitDirection, options?: { shell?: string }) => void;
  closePane: (paneId: string) => void;
  /** ペインの ID を渡すとそのペインを（渡さなければアクティブペインを）ズームする */
  toggleZoom: (paneId?: string) => void;
  movePaneToNewTab: (paneId: string) => void;
  openFind: (paneId: string) => void;
  closeFind: () => void;
  updateRatio: (tabId: string, path: number[], ratios: number[]) => void;
}

export interface PaneUi {
  fontFamily: string;
  fontSize: number;
  terminalTheme: ITheme;
  showHeaders: boolean;
  /** 検索バーを開いているペイン */
  findPaneId: string | null;
  homeDir?: string;
  /** モーダル表示中は端末へ自動フォーカスしない（入力が裏のシェルへ流れるのを防ぐ） */
  overlayOpen: boolean;
  preferences: Preferences;
}

/** タブ単位の情報（タブ切り替え・ズーム時のみ変わる） */
export interface TabInfo {
  tabId: string;
  isTabActive: boolean;
  multiPane: boolean;
  zoomed: boolean;
}

export const PaneActionsContext = createContext<PaneActions | null>(null);
export const PaneUiContext = createContext<PaneUi | null>(null);
export const TabInfoContext = createContext<TabInfo>({
  tabId: "",
  isTabActive: false,
  multiPane: false,
  zoomed: false,
});

export function usePaneActions(): PaneActions {
  const value = useContext(PaneActionsContext);
  if (!value) throw new Error("PaneActionsContext is missing");
  return value;
}

export function usePaneUi(): PaneUi {
  const value = useContext(PaneUiContext);
  if (!value) throw new Error("PaneUiContext is missing");
  return value;
}

export const useTabInfo = () => useContext(TabInfoContext);
