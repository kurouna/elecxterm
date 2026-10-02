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
