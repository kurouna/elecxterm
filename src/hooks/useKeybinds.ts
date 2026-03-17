import { useEffect, useRef } from "react";

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
  // options を ref で保持することで、リスナーを張り替えずに最新の関数を参照できるようにする
  const optionsRef = useRef(options);
  
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const opts = optionsRef.current;
      
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
            opts.onCommandPalette();
            break;
          case "T":
            e.preventDefault();
            opts.onNewTab();
            break;
          case "ArrowRight":
          case "F":
            e.preventDefault();
            e.stopPropagation();
            opts.onNextTab();
            break;
          case "ArrowLeft":
          case "B":
            e.preventDefault();
            e.stopPropagation();
            opts.onPrevTab();
            break;
          case "P":
          case "ArrowUp":
            e.preventDefault();
            e.stopPropagation();
            opts.onPrevPane();
            break;
          case "N":
          case "ArrowDown":
            e.preventDefault();
            e.stopPropagation();
            opts.onNextPane();
            break;
          case "<":
          case ",":
            e.preventDefault();
            opts.onFirstPane();
            break;
          case ">":
          case ".":
            e.preventDefault();
            opts.onLastPane();
            break;
          case "D":
            e.preventDefault();
            opts.onSplitHorizontal("cmd.exe");
            break;
          case "E":
            e.preventDefault();
            opts.onSplitVertical("cmd.exe");
            break;
          case "W":
            e.preventDefault();
            opts.onClosePane();
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
            opts.onSplitHorizontal("powershell.exe");
            break;
          case "E":
            e.preventDefault();
            e.stopPropagation();
            opts.onSplitVertical("powershell.exe");
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []); // 依存配列を空にして一度だけ登録
}
