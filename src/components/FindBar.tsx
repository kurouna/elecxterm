import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, CaseSensitive, Regex, WholeWord, X } from "lucide-react";
import type { ISearchOptions } from "@xterm/addon-search";
import { TerminalEntry } from "../services/terminalRegistry";
import { CRT_EXIT, IconButton } from "./ui";

interface FindBarProps {
  entry: TerminalEntry;
  onClose: () => void;
}

/** 検索ハイライトの色（SearchAddon は #RRGGBB 形式のみ受け付ける） */
function decorations(): ISearchOptions["decorations"] {
  const css = getComputedStyle(document.documentElement);
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const accent = css.getPropertyValue("--accent").trim() || "#8b9cff";
  return {
    matchBackground: dark ? "#3a3f63" : "#dfe6ff",
    matchOverviewRuler: accent,
    activeMatchBackground: dark ? "#6d5d1c" : "#ffd75e",
    activeMatchColorOverviewRuler: "#fbbf24",
  };
}

/** ペイン内検索バー（VS Code / Windows Terminal と同じ操作感） */
export function FindBar({ entry, onClose }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [result, setResult] = useState<{ index: number; count: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // 既に選択している文字列があれば初期値にする
    const selection = entry.terminal.getSelection();
    if (selection && !selection.includes("\n")) setQuery(selection);
    const sub = entry.searchAddon.onDidChangeResults(({ resultIndex, resultCount }) =>
      setResult({ index: resultIndex, count: resultCount })
    );
    return () => {
      sub.dispose();
      entry.searchAddon.clearDecorations();
    };
  }, [entry]);

  const find = useCallback(
    (direction: "next" | "prev", incremental = false) => {
      if (!query) {
        entry.searchAddon.clearDecorations();
        setResult(null);
        return;
      }
      const opts: ISearchOptions = { caseSensitive, regex, wholeWord, incremental, decorations: decorations() };
      try {
        if (direction === "next") entry.searchAddon.findNext(query, opts);
        else entry.searchAddon.findPrevious(query, opts);
      } catch {
        // 入力途中の不正な正規表現は無視する
      }
    },
    [entry, query, caseSensitive, regex, wholeWord]
  );

  // 入力・オプション変更のたびにインクリメンタル検索
  useEffect(() => {
    find("next", true);
  }, [find]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      find(e.shiftKey ? "prev" : "next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.altKey && ["c", "r", "w"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      const key = e.key.toLowerCase();
      if (key === "c") setCaseSensitive((v) => !v);
      if (key === "r") setRegex((v) => !v);
      if (key === "w") setWholeWord((v) => !v);
    }
  };

  const status = !query
    ? ""
    : result && result.count > 0
      ? `${result.index >= 0 ? result.index + 1 : "?"} of ${result.count}`
      : "No results";

  return (
    <motion.div
      initial={false}
      exit={CRT_EXIT}
      style={{ "--crt-duration": "300ms" } as React.CSSProperties}
      className="crt-on absolute right-3 top-2 z-30 flex items-center gap-1 rounded-lg border border-border-strong bg-bg-glass p-1 shadow-[var(--shadow-lg)] backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find"
        aria-label="Find in terminal"
        spellCheck={false}
        className="h-6 w-44 rounded-md bg-bg-main px-2 text-[12px] text-tx-primary outline-none ring-1 ring-border-dim focus:ring-accent placeholder:text-tx-muted"
      />
      <span className={`w-16 text-center text-[11px] tabular-nums ${status === "No results" ? "text-danger" : "text-tx-muted"}`}>
        {status}
      </span>
      <IconButton size="sm" label="Match case" shortcut="Alt+C" active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)}>
        <CaseSensitive size={14} />
      </IconButton>
      <IconButton size="sm" label="Match whole word" shortcut="Alt+W" active={wholeWord} onClick={() => setWholeWord((v) => !v)}>
        <WholeWord size={14} />
      </IconButton>
      <IconButton size="sm" label="Use regular expression" shortcut="Alt+R" active={regex} onClick={() => setRegex((v) => !v)}>
        <Regex size={13} />
      </IconButton>
      <span className="mx-0.5 h-4 w-px bg-border-strong" />
      <IconButton size="sm" label="Previous match" shortcut="Shift+Enter" onClick={() => find("prev")}>
        <ArrowUp size={13} />
      </IconButton>
      <IconButton size="sm" label="Next match" shortcut="Enter" onClick={() => find("next")}>
        <ArrowDown size={13} />
      </IconButton>
      <IconButton size="sm" label="Close" shortcut="Esc" onClick={onClose}>
        <X size={13} />
      </IconButton>
    </motion.div>
  );
}
