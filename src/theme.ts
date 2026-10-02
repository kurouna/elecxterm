import type { ITheme } from "@xterm/xterm";

export type ResolvedTheme = "dark" | "light";

/**
 * ANSI 16 色。背景・前景・カーソル・選択色など UI と共有する色は
 * index.css の CSS 変数から読み取るので、ここでは端末固有の色だけを定義する。
 */
const ANSI: Record<ResolvedTheme, ITheme> = {
  dark: {
    black: "#1b2030",
    red: "#f7768e",
    green: "#5fd7a7",
    yellow: "#f5c46b",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#5ccfe6",
    white: "#c8d0e0",
    brightBlack: "#5c6680",
    brightRed: "#ff9aac",
    brightGreen: "#8cecc4",
    brightYellow: "#ffd98e",
    brightBlue: "#a5c0ff",
    brightMagenta: "#d4bcff",
    brightCyan: "#8ce6f5",
    brightWhite: "#ffffff",
  },
  light: {
    black: "#1f2937",
    red: "#c0263f",
    green: "#11795a",
    yellow: "#9a6400",
    blue: "#2952cc",
    magenta: "#8a3fd1",
    cyan: "#0b7285",
    white: "#4b5563",
    brightBlack: "#6b7280",
    brightRed: "#e0314f",
    brightGreen: "#16946d",
    brightYellow: "#b77900",
    brightBlue: "#3b66e8",
    brightMagenta: "#a259e6",
    brightCyan: "#0e8aa1",
    brightWhite: "#111827",
  },
};

/** 現在 <html> に適用されているテーマの CSS 変数から xterm のテーマを組み立てる */
export function buildTerminalTheme(mode: ResolvedTheme): ITheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = v("--bg-main", mode === "dark" ? "#0b0e14" : "#ffffff");
  const accent = v("--accent", mode === "dark" ? "#8b9cff" : "#3b5bdb");

  return {
    ...ANSI[mode],
    background: bg,
    foreground: v("--term-fg", mode === "dark" ? "#dfe4ee" : "#1f2937"),
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: v("--term-selection", "rgba(139, 156, 255, 0.32)"),
    selectionInactiveBackground: v("--term-selection-inactive", "rgba(139, 156, 255, 0.16)"),
    scrollbarSliderBackground: v("--term-scrollbar", "rgba(128, 140, 165, 0.25)"),
    scrollbarSliderHoverBackground: v("--term-scrollbar-hover", "rgba(139, 156, 255, 0.5)"),
    scrollbarSliderActiveBackground: v("--term-scrollbar-active", "rgba(139, 156, 255, 0.75)"),
  };
}

// ---------------------------------------------------------------------------
// 配色プリセット
// ---------------------------------------------------------------------------

/** 配色 1 つ分。16 色は [black, red, green, yellow, blue, magenta, cyan, white, bright×8] の順 */
interface SchemeColors {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  ansi: [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];
}

export interface TerminalScheme {
  id: string;
  name: string;
  /** UI がダークのときの配色。light しか無いスキームは常に light を使う */
  dark?: SchemeColors;
  light?: SchemeColors;
}

const SOLARIZED_ANSI: SchemeColors["ansi"] = [
  "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5",
  "#586e75", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
];

/**
 * 端末の配色プリセット。"elecxterm" は UI のテーマ（CSS 変数）に追従する既定の配色。
 * dark / light の両方を持つものは UI テーマに合わせて切り替わる。
 */
export const TERMINAL_SCHEMES: TerminalScheme[] = [
  { id: "elecxterm", name: "elecxterm (follows UI)" },
  {
    id: "github",
    name: "GitHub",
    dark: {
      background: "#0d1117", foreground: "#e6edf3", cursor: "#2f81f7", selection: "#264f78cc",
      ansi: ["#484f58", "#ff7b72", "#3fb950", "#d29922", "#58a6ff", "#bc8cff", "#39c5cf", "#b1bac4",
        "#6e7681", "#ffa198", "#56d364", "#e3b341", "#79c0ff", "#d2a8ff", "#56d4dd", "#ffffff"],
    },
    light: {
      background: "#ffffff", foreground: "#1f2328", cursor: "#0969da", selection: "#b6e3ff99",
      ansi: ["#24292f", "#cf222e", "#116329", "#4d2d00", "#0969da", "#8250df", "#1b7c83", "#6e7781",
        "#57606a", "#a40e26", "#1a7f37", "#633c01", "#218bff", "#a475f9", "#3192aa", "#8c959f"],
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    dark: {
      background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0dc", selection: "#585b7099",
      ansi: ["#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
        "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8"],
    },
    light: {
      background: "#eff1f5", foreground: "#4c4f69", cursor: "#dc8a78", selection: "#acb0be99",
      ansi: ["#5c5f77", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#acb0be",
        "#6c6f85", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#bcc0cc"],
    },
  },
  {
    id: "solarized",
    name: "Solarized",
    dark: { background: "#002b36", foreground: "#839496", cursor: "#93a1a1", selection: "#073642", ansi: SOLARIZED_ANSI },
    light: { background: "#fdf6e3", foreground: "#657b83", cursor: "#586e75", selection: "#eee8d5", ansi: SOLARIZED_ANSI },
  },
  {
    id: "one-dark",
    name: "One Dark",
    dark: {
      background: "#282c34", foreground: "#abb2bf", cursor: "#528bff", selection: "#3e4451",
      ansi: ["#282c34", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
        "#5c6370", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff"],
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    dark: {
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", selection: "#44475a",
      ansi: ["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
        "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff"],
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    dark: {
      background: "#1a1b26", foreground: "#c0caf5", cursor: "#c0caf5", selection: "#33467c",
      ansi: ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
        "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"],
    },
  },
  {
    id: "nord",
    name: "Nord",
    dark: {
      background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", selection: "#434c5e",
      ansi: ["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
        "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4"],
    },
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    dark: {
      background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", selection: "#504945",
      ansi: ["#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984",
        "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2"],
    },
  },
];

/** プリセットのうち、指定した UI テーマで実際に使われる配色（elecxterm は undefined） */
export function schemeColors(id: string, mode: ResolvedTheme): SchemeColors | undefined {
  const scheme = TERMINAL_SCHEMES.find((s) => s.id === id);
  if (!scheme) return undefined;
  return scheme[mode] ?? scheme.dark ?? scheme.light;
}

/**
 * 配色プリセットを適用した xterm のテーマ。"elecxterm"（または不明な ID）のときは
 * UI テーマ由来の `base` をそのまま返す。スクロールバーの色は UI と揃える。
 */
export function applyScheme(base: ITheme, id: string, mode: ResolvedTheme): ITheme {
  const c = schemeColors(id, mode);
  if (!c) return base;
  const [black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = c.ansi;
  return {
    background: c.background,
    foreground: c.foreground,
    cursor: c.cursor,
    cursorAccent: c.background,
    selectionBackground: c.selection,
    selectionInactiveBackground: c.selection,
    scrollbarSliderBackground: base.scrollbarSliderBackground,
    scrollbarSliderHoverBackground: base.scrollbarSliderHoverBackground,
    scrollbarSliderActiveBackground: base.scrollbarSliderActiveBackground,
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  };
}

/** 設定パネルの見本用: 背景・前景と基本 8 色 */
export function schemePreview(id: string, mode: ResolvedTheme): { background: string; foreground: string; colors: string[] } {
  const c = schemeColors(id, mode);
  if (c) return { background: c.background, foreground: c.foreground, colors: c.ansi.slice(1, 7) };
  const t = buildTerminalTheme(mode);
  return {
    background: t.background ?? "#000",
    foreground: t.foreground ?? "#fff",
    colors: [t.red, t.green, t.yellow, t.blue, t.magenta, t.cyan].map((x) => x ?? "#888"),
  };
}
