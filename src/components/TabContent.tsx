import { memo, useEffect, useMemo, useRef } from "react";
import { flash } from "../services/crt";
import { SplitLayout } from "./SplitLayout";
import { TerminalPane } from "./TerminalPane";
import { Tab } from "../types";
import { TabInfoContext } from "./PaneContext";
import { findPane } from "../services/paneInfo";

interface TabContentProps {
  tab: Tab;
  isActive: boolean;
}

/**
 * タブのコンテンツ。非アクティブなタブも DOM にマウントしたまま保持して
 * xterm の状態とサイズを維持するが、`visibility` と `z-index` で瞬時に
 * 切り替えることでタブ切替時のクロスフェード由来のチラつきを防ぐ。
 * ズーム中はアクティブペインだけを描画する（他のペインは registry 上で生き続ける）。
 */
function TabContentComponent({ tab, isActive }: TabContentProps) {
  const multiPane = tab.layout.type !== "pane";
  const zoomed = multiPane && !!tab.zoomed;
  // Context value はタブの状態が変わった時だけ作り直す（TerminalPane の memo を貫通させない）
  const info = useMemo(
    () => ({ tabId: tab.id, isTabActive: isActive, multiPane, zoomed }),
    [tab.id, isActive, multiPane, zoomed]
  );
  const zoomedPane = zoomed ? findPane(tab.layout, tab.activePaneId) : undefined;

  // タブを切り替えて表に出たとき、チャンネルを変えたような一瞬の明滅を入れる
  // （新しく開いたタブは、ペインの電源オン演出に任せる）
  const contentRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current) flash(contentRef.current);
    wasActive.current = isActive;
  }, [isActive]);

  return (
    <TabInfoContext.Provider value={info}>
      <div
        ref={contentRef}
        data-tab-content={tab.id}
        aria-hidden={!isActive}
        className="absolute inset-0"
        style={{
          visibility: isActive ? "visible" : "hidden",
          zIndex: isActive ? 10 : 0,
          pointerEvents: isActive ? "auto" : "none",
        }}
      >
        {zoomedPane ? (
          <TerminalPane pane={zoomedPane} isActive />
        ) : (
          <SplitLayout node={tab.layout} activePane={tab.activePaneId} />
        )}
      </div>
    </TabInfoContext.Provider>
  );
}

export const TabContent = memo(TabContentComponent);
