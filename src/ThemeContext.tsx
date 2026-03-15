import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("elecxterm-theme") as Theme) || "dark";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("elecxterm-theme", newTheme);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    
    function updateTheme() {
      let effectiveTheme: "dark" | "light" = "dark";
      
      if (theme === "system") {
        effectiveTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      } else {
        effectiveTheme = theme as "dark" | "light";
      }
      
      root.setAttribute("data-theme", effectiveTheme);
      setResolvedTheme(effectiveTheme);
    }

    updateTheme();

    // システム設定の変更を監視
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      if (theme === "system") updateTheme();
    };
    
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
