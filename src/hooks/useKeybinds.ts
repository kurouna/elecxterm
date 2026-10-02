import { useEffect, useRef } from "react";

export interface KeybindHandlers {
  onCommandPalette: () => void;
  onPaneOverview: () => void;
  onQuickSwitch: (direction: 1 | -1) => void;
  onShortcutHelp: () => void;
  onSettings: () => void;
  onFind: () => void;
  onNewTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onGoToTab: (index: number) => void;
  onNextPane: () => void;
  onPrevPane: () => void;
  onFirstPane: () => void;
  onLastPane: () => void;
  onSplitHorizontal: (shell: string) => void;
  onSplitVertical: (shell: string) => void;
  onClosePane: () => void;
  onToggleZoom: () => void;
  onFontSizeUp: () => void;
  onFontSizeDown: () => void;
  onFontSizeReset: () => void;
}

export interface KeybindOptions extends KeybindHandlers {
  /** オーバーレイ（パレット・概要表示など）が開いている間は true */
  overlayOpen: boolean;
}

type Mods = "ctrl" | "ctrl+shift" | "ctrl+alt";

interface Binding {
  mods: Mods;
  /** e.key（大文字小文字は区別しない）または e.code のいずれかに一致すれば発火 */
  keys?: string[];
  codes?: string[];
  run: (h: KeybindHandlers, e: KeyboardEvent) => void;
  /** オーバーレイ表示中も有効にする（開閉トグル系） */
  global?: boolean;
  /** キーリピートでは発火させない（開閉トグル系） */
  noRepeat?: boolean;
}

/**
 * キーバインド定義。表示用の一覧は src/keymap.ts にあり、ここを変えたら合わせて更新する。
 * フォントサイズは e.code（物理キー位置）で判定する。配列・Shift の文字変換に依存しないため、
 * JIS でも US でも「-キー = 縮小 / その右隣キー（JIS: ^ / US: =）= 拡大」になる。
 */
const BINDINGS: Binding[] = [
  { mods: "ctrl+shift", keys: ["k"], run: (h) => h.onCommandPalette(), global: true, noRepeat: true },
  { mods: "ctrl+shift", keys: ["o"], run: (h) => h.onPaneOverview(), global: true, noRepeat: true },
  { mods: "ctrl+shift", keys: ["?", "/"], codes: ["Slash"], run: (h) => h.onShortcutHelp(), global: true, noRepeat: true },
  { mods: "ctrl", keys: ["Tab"], run: (h) => h.onQuickSwitch(1) },
  { mods: "ctrl+shift", keys: ["Tab"], run: (h) => h.onQuickSwitch(-1) },
  { mods: "ctrl+shift", keys: ["s"], run: (h) => h.onFind(), noRepeat: true },
  { mods: "ctrl+shift", keys: ["t"], run: (h) => h.onNewTab(), noRepeat: true },
  { mods: "ctrl+shift", keys: ["ArrowRight", "f"], run: (h) => h.onNextTab() },
  { mods: "ctrl+shift", keys: ["ArrowLeft", "b"], run: (h) => h.onPrevTab() },
  { mods: "ctrl+shift", keys: ["ArrowUp", "p"], run: (h) => h.onPrevPane() },
  { mods: "ctrl+shift", keys: ["ArrowDown", "n"], run: (h) => h.onNextPane() },
  { mods: "ctrl+shift", keys: ["<", ",", "Home"], run: (h) => h.onFirstPane() },
  // Ctrl+Shift+.（> と同じキー）は設定パネル。最後のペインは End に移した
  { mods: "ctrl+shift", keys: [">", "."], codes: ["Period"], run: (h) => h.onSettings(), global: true, noRepeat: true },
  { mods: "ctrl+shift", keys: ["End"], run: (h) => h.onLastPane() },
  { mods: "ctrl+shift", keys: ["d"], run: (h) => h.onSplitHorizontal("cmd.exe"), noRepeat: true },
  { mods: "ctrl+shift", keys: ["e"], run: (h) => h.onSplitVertical("cmd.exe"), noRepeat: true },
  { mods: "ctrl+alt", keys: ["d"], run: (h) => h.onSplitHorizontal("pwsh.exe"), noRepeat: true },
  { mods: "ctrl+alt", keys: ["e"], run: (h) => h.onSplitVertical("pwsh.exe"), noRepeat: true },
  { mods: "ctrl+shift", keys: ["w"], run: (h) => h.onClosePane(), noRepeat: true },
  { mods: "ctrl+shift", keys: ["z"], run: (h) => h.onToggleZoom(), noRepeat: true },
  { mods: "ctrl+shift", codes: ["Minus"], run: (h) => h.onFontSizeDown() },
  { mods: "ctrl+shift", codes: ["Equal"], run: (h) => h.onFontSizeUp() },
  { mods: "ctrl+shift", codes: ["IntlYen", "Backslash"], run: (h) => h.onFontSizeReset() },
  { mods: "ctrl", keys: ["0"], run: (h) => h.onFontSizeReset() },
  {
    mods: "ctrl+alt",
    codes: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"],
    run: (h, e) => h.onGoToTab(Number(e.code.slice(5)) - 1),
  },
];

/** ブラウザ既定の動作（リロード・印刷・検索など）がターミナル操作を邪魔するキー */
const BLOCKED_CTRL_KEYS = new Set(["r", "p", "f", "g", "s", "j", "h", "o", "n"]);

function modsOf(e: KeyboardEvent): Mods | null {
  if (!e.ctrlKey || e.metaKey) return null;
  if (e.shiftKey && !e.altKey) return "ctrl+shift";
  // AltGr は Ctrl+Alt として届く。AltGr で文字を打つ配列（独語など）の入力を奪わない
  if (e.altKey && !e.shiftKey) return e.getModifierState("AltGraph") ? null : "ctrl+alt";
  if (!e.shiftKey && !e.altKey) return "ctrl";
  return null;
}

function matches(binding: Binding, e: KeyboardEvent): boolean {
  if (binding.codes?.includes(e.code)) return true;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return binding.keys?.some((k) => k === key) ?? false;
}

export function useKeybinds(options: KeybindOptions) {
  // options を ref で保持することで、リスナーを張り替えずに最新の関数を参照できるようにする
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // IME 変換中のキーはショートカットとして解釈しない。
      // 日本語入力中に Ctrl+... 相当のイベントが流れてくることがあるため。
      if (e.isComposing || e.keyCode === 229) return;

      const ctrlOnlyOrShift = e.ctrlKey && !e.altKey;
      if ((ctrlOnlyOrShift && BLOCKED_CTRL_KEYS.has(e.key.toLowerCase())) || e.key === "F5") {
        // 端末側にはキーを届けたいので stopPropagation はしない
        e.preventDefault();
      }

      const mods = modsOf(e);
      if (!mods) return;
      const binding = BINDINGS.find((b) => b.mods === mods && matches(b, e));
      if (!binding) return;

      const opts = optionsRef.current;
      // オーバーレイ表示中は、そのオーバーレイ自身にキーを任せる
      if (opts.overlayOpen && !binding.global) return;

      // 処理したキーは端末（xterm）へ流さない
      e.preventDefault();
      e.stopPropagation();
      if (binding.noRepeat && e.repeat) return;
      binding.run(opts, e);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);
}
