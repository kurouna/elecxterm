import { useEffect } from "react";

interface KeybindOptions {
  onCommandPalette: () => void;
  onNewTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onNextPane: () => void;
  onPrevPane: () => void;
  onFirstPane: () => void;
  onLastPane: () => void;
  onSplitHorizontal: (shell?: string) => void;
  onSplitVertical: (shell?: string) => void;
  onClosePane: () => void;
}

export function useKeybinds(options: KeybindOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block default browser behavior that interferes with terminal or app usage
      const isCtrl = e.ctrlKey;
      const key = e.key.toLowerCase();
      
      // Browser shortcuts to block
      if (
        (isCtrl && (key === "r" || key === "p" || key === "f" || key === "g" || key === "s" || key === "j" || key === "h" || key === "o" || key === "n")) ||
        e.key === "F5"
      ) {
        e.preventDefault();
        // Do NOT stopPropagation here so the terminal can still receive the event
      }

      if (!e.ctrlKey) return;

      // Ctrl+Shift
      if (e.shiftKey) {
        switch (e.key) {
          case "K":
            e.preventDefault();
            e.stopPropagation();
            options.onCommandPalette();
            break;
          case "T":
            e.preventDefault();
            options.onNewTab();
            break;
          case "ArrowRight":
            e.preventDefault();
            e.stopPropagation();
            options.onNextTab();
            break;
          case "ArrowLeft":
            e.preventDefault();
            e.stopPropagation();
            options.onPrevTab();
            break;
          case "P":
            e.preventDefault();
            options.onPrevPane();
            break;
          case "N":
            e.preventDefault();
            options.onNextPane();
            break;
          case "<":
          case ",":
            e.preventDefault();
            options.onFirstPane();
            break;
          case ">":
          case ".":
            e.preventDefault();
            options.onLastPane();
            break;
          case "D":
            e.preventDefault();
            options.onSplitHorizontal("cmd.exe");
            break;
          case "E":
            e.preventDefault();
            options.onSplitVertical("cmd.exe");
            break;
          case "W":
            e.preventDefault();
            options.onClosePane();
            break;
        }
      } 
      // Ctrl+Alt
      else if (e.altKey) {
        const key = e.key.toUpperCase();
        switch (key) {
          case "D":
            e.preventDefault();
            e.stopPropagation();
            options.onSplitHorizontal("powershell.exe");
            break;
          case "E":
            e.preventDefault();
            e.stopPropagation();
            options.onSplitVertical("powershell.exe");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [options]);
}
