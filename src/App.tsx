import { useCallback, useEffect, useMemo, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { SplitLayout } from "./components/SplitLayout";
import { CommandPalette } from "./components/CommandPalette";
import { useLayout } from "./hooks/useLayout";
import { CommandItem, PaneStatus } from "./types";

function App() {
  const {
    layout,
    activePane,
    setActivePane,
    splitPane,
    closePane,
    updateRatio,
    ensureActivePane,
    nextPane,
    prevPane,
    firstPane,
    lastPane,
  } = useLayout();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paneStatuses, setPaneStatuses] = useState<Record<string, PaneStatus>>(
    {}
  );

  // 初回レンダリング時にアクティブペインを設定
  useEffect(() => {
    ensureActivePane(layout);
  }, []);

  // ペインステータス変更ハンドラ
  const handlePaneStatusChange = useCallback(
    (id: string, status: PaneStatus) => {
      setPaneStatuses((prev) => ({ ...prev, [id]: status }));
    },
    []
  );

  // コマンドパレットのコマンド一覧
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "split-h-cmd",
        label: "画面を縦に分割 (CMD)",
        description: "Command Prompt を右側に開きます",
        shortcut: "Ctrl+Shift+D",
        category: "レイアウト",
        action: () => {
          if (activePane) splitPane(activePane, "horizontal", { shell: "cmd.exe" });
        },
      },
      {
        id: "split-h-ps",
        label: "画面を縦に分割 (PowerShell)",
        description: "PowerShell を右側に開きます",
        category: "レイアウト",
        action: () => {
          if (activePane) splitPane(activePane, "horizontal", { shell: "powershell.exe" });
        },
      },
      {
        id: "split-v-cmd",
        label: "画面を横に分割 (CMD)",
        description: "Command Prompt を下側に開きます",
        shortcut: "Ctrl+Shift+E",
        category: "レイアウト",
        action: () => {
          if (activePane) splitPane(activePane, "vertical", { shell: "cmd.exe" });
        },
      },
      {
        id: "split-v-ps",
        label: "画面を横に分割 (PowerShell)",
        description: "PowerShell を下側に開きます",
        category: "レイアウト",
        action: () => {
          if (activePane) splitPane(activePane, "vertical", { shell: "powershell.exe" });
        },
      },
      {
        id: "close-pane",
        label: "ペインを閉じる (Close)",
        description: "アクティブなペインを閉じます",
        shortcut: "Ctrl+Shift+W",
        category: "レイアウト",
        action: () => {
          if (activePane) closePane(activePane);
        },
      },
      {
        id: "clear-layout",
        label: "レイアウトをリセット",
        description: "すべての分割を解除して単一ペインに戻します",
        category: "一般",
        action: () => {
          // 簡易的なリセット
          window.location.reload();
        },
      },
      {
        id: "toggle-command-palette",
        label: "コマンドパレットを表示",
        shortcut: "Ctrl+Shift+P",
        category: "一般",
        action: () => {}, // ダミー
      },
    ],
    [activePane, splitPane, closePane]
  );

  // グローバルキーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // コマンドパレット (Ctrl+Shift+K)
      if (e.ctrlKey && e.shiftKey && e.key === "K") {
        e.preventDefault();
        e.stopPropagation();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // シェル移動: 前へ (Ctrl+Shift+P)
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        prevPane();
        return;
      }

      // シェル移動: 次へ (Ctrl+Shift+N)
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        nextPane();
        return;
      }

      // シェル移動: 先頭へ (Ctrl+Shift+<) - 日本語キーボード等考慮して "," もチェック
      if (e.ctrlKey && e.shiftKey && (e.key === "<" || e.key === ",")) {
        e.preventDefault();
        firstPane();
        return;
      }

      // シェル移動: 最後へ (Ctrl+Shift+>) - 日本語キーボード等考慮して "." もチェック
      if (e.ctrlKey && e.shiftKey && (e.key === ">" || e.key === ".")) {
        e.preventDefault();
        lastPane();
        return;
      }

      // 縦分割
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        if (activePane) splitPane(activePane, "horizontal");
        return;
      }

      // 横分割
      if (e.ctrlKey && e.shiftKey && e.key === "E") {
        e.preventDefault();
        if (activePane) splitPane(activePane, "vertical");
        return;
      }

      // ペインを閉じる
      if (e.ctrlKey && e.shiftKey && e.key === "W") {
        e.preventDefault();
        if (activePane) closePane(activePane);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePane, splitPane, closePane]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-lg bg-surface-primary">
      {/* カスタムタイトルバー */}
      <TitleBar sessionName="elecxterm" />

      {/* メインコンテンツエリア */}
      <div className="flex-1 overflow-hidden p-0.5">
        <SplitLayout
          node={layout}
          activePane={activePane}
          onPaneActivate={setActivePane}
          onPaneStatusChange={handlePaneStatusChange}
          onRatioChange={(path, ratios) => {
            updateRatio(path, ratios);
          }}
        />
      </div>

      {/* ステータスバー */}
      <div className="h-7 flex-shrink-0 bg-surface-primary/95 flex items-center justify-between px-3 text-[9px] text-text-muted border-t border-border-default/10 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 opacity-80">
            <div className="h-1.5 w-1.5 rounded-full bg-accent-emerald shadow-[0_0_5px_rgba(52,211,153,0.3)] animate-pulse" />
            <span className="font-semibold text-text-secondary">{Object.values(paneStatuses).filter((s) => s === "running").length}</span> RUNNING
          </span>
        </div>

        <div className="flex items-center gap-6 uppercase tracking-widest font-bold">
          {/* レイアウト操作 */}
          <div className="flex gap-4 border-r border-border-default/10 pr-6">
            <span className="flex gap-1.5">Split <span className="text-text-secondary">^⇧D/E</span></span>
            <span className="flex gap-1.5">Close <span className="text-text-secondary">^⇧W</span></span>
          </div>

          {/* ナビゲーション */}
          <div className="flex gap-4 border-r border-border-default/10 pr-6">
            <span className="flex gap-1.5">Move <span className="text-text-secondary">^⇧P/N</span></span>
            <span className="flex gap-1.5">Edge <span className="text-text-secondary">^⇧&lt;/&gt;</span></span>
          </div>

          {/* パレット */}
          <div className="flex items-center gap-2 text-accent-primary">
            <span className="animate-pulse text-[8px]">●</span>
            <span>Palette <span className="text-text-primary font-black">^⇧K</span></span>
          </div>
        </div>
      </div>

      {/* コマンドパレット */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}

export default App;
