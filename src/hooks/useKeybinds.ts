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
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onClosePane: () => void;
}

export function useKeybinds(options: KeybindOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;

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
          options.onSplitHorizontal();
          break;
        case "E":
          e.preventDefault();
          options.onSplitVertical();
          break;
        case "W":
          e.preventDefault();
          options.onClosePane();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [options]);
}
