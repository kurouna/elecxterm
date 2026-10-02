/**
 * 表示用のショートカット一覧（パレット・ヘルプ・ツールチップで共有）。
 * 実際の判定は hooks/useKeybinds.ts の BINDINGS にあり、変更時は両方を合わせる。
 */
export const KEYS = {
  palette: "Ctrl+Shift+K",
  overview: "Ctrl+Shift+O",
  quickSwitch: "Ctrl+Tab",
  quickSwitchBack: "Ctrl+Shift+Tab",
  help: "Ctrl+Shift+?",
  settings: "Ctrl+,",
  find: "Ctrl+Shift+S",
  newTab: "Ctrl+Shift+T",
  nextTab: "Ctrl+Shift+F",
  nextTabAlt: "Ctrl+Shift+→",
  prevTab: "Ctrl+Shift+B",
  prevTabAlt: "Ctrl+Shift+←",
  goToTab: "Ctrl+Alt+1…9",
  nextPane: "Ctrl+Shift+N",
  nextPaneAlt: "Ctrl+Shift+↓",
  prevPane: "Ctrl+Shift+P",
  prevPaneAlt: "Ctrl+Shift+↑",
  firstPane: "Ctrl+Shift+<",
  lastPane: "Ctrl+Shift+>",
  splitRightCmd: "Ctrl+Shift+D",
  splitDownCmd: "Ctrl+Shift+E",
  splitRightPwsh: "Ctrl+Alt+D",
  splitDownPwsh: "Ctrl+Alt+E",
  closePane: "Ctrl+Shift+W",
  zoom: "Ctrl+Shift+Z",
  fontUp: "Ctrl+Shift+^",
  fontDown: "Ctrl+Shift+-",
  fontReset: "Ctrl+0",
  copy: "Ctrl+Shift+C",
  paste: "Ctrl+V",
} as const;

export interface ShortcutGroup {
  title: string;
  items: { label: string; keys: string[] }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigate",
    items: [
      { label: "Pane overview (all tabs)", keys: [KEYS.overview] },
      { label: "Quick switch to recent pane", keys: [KEYS.quickSwitch, KEYS.quickSwitchBack] },
      { label: "Command palette", keys: [KEYS.palette] },
      { label: "Keyboard shortcuts", keys: [KEYS.help] },
      { label: "Settings", keys: [KEYS.settings] },
      { label: "Find in terminal", keys: [KEYS.find] },
    ],
  },
  {
    title: "Tabs",
    items: [
      { label: "New tab", keys: [KEYS.newTab] },
      { label: "Next tab", keys: [KEYS.nextTab, KEYS.nextTabAlt] },
      { label: "Previous tab", keys: [KEYS.prevTab, KEYS.prevTabAlt] },
      { label: "Go to tab 1–9", keys: [KEYS.goToTab] },
    ],
  },
  {
    title: "Panes",
    items: [
      { label: "Split right (CMD)", keys: [KEYS.splitRightCmd] },
      { label: "Split down (CMD)", keys: [KEYS.splitDownCmd] },
      { label: "Split right (PowerShell)", keys: [KEYS.splitRightPwsh] },
      { label: "Split down (PowerShell)", keys: [KEYS.splitDownPwsh] },
      { label: "Next / previous pane", keys: [KEYS.nextPane, KEYS.prevPane] },
      { label: "First / last pane", keys: [KEYS.firstPane, KEYS.lastPane] },
      { label: "Zoom pane", keys: [KEYS.zoom] },
      { label: "Close pane", keys: [KEYS.closePane] },
    ],
  },
  {
    title: "Terminal",
    items: [
      { label: "Copy selection (Ctrl+C only while text is selected)", keys: [KEYS.copy, "Ctrl+C"] },
      { label: "Paste", keys: [KEYS.paste, "Ctrl+Shift+V", "Right click"] },
      { label: "Font size + / −", keys: [KEYS.fontUp, KEYS.fontDown] },
      { label: "Reset font size", keys: [KEYS.fontReset] },
      { label: "Restart exited shell", keys: ["Enter"] },
    ],
  },
];
