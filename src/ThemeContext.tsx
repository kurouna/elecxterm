import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ITheme } from "@xterm/xterm";
import { buildTerminalTheme, ResolvedTheme } from "./theme";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "elecxterm-theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
  /** CSS 変数から導出した xterm テーマ（UI と端末の色が常に一致する） */
  terminalTheme: ITheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    // ストレージが使えない環境では既定値
  }
  return "dark";
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

function applyTheme(mode: ResolvedTheme): ITheme {
  document.documentElement.setAttribute("data-theme", mode);
  return buildTerminalTheme(mode);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemTick, setSystemTick] = useState(0);
  const resolvedTheme = useMemo(() => resolve(theme), [theme, systemTick]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 保存できなくても表示上の切り替えは行う
    }
  }, []);

  // システム設定の変更を監視（"system" のときだけ意味がある）
  useLayoutEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia(LIGHT_QUERY);
    const handler = () => setSystemTick((n) => n + 1);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  // data-theme を描画前に適用し、その CSS 変数から端末テーマを組み立てる。
  // 初回は index.html のインラインスクリプトで適用済みの属性をそのまま使う。
  const [terminalTheme, setTerminalTheme] = useState<ITheme>(() => applyTheme(resolvedTheme));
  const appliedRef = useRef(resolvedTheme);
  useLayoutEffect(() => {
    if (appliedRef.current === resolvedTheme) return;
    appliedRef.current = resolvedTheme;
    setTerminalTheme(applyTheme(resolvedTheme));
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme, terminalTheme }),
    [theme, setTheme, resolvedTheme, terminalTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
