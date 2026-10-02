import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { CommandItem } from "../types";
import { Kbd, Overlay, PANEL_CLASS } from "./ui";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

/** 検索語があるときだけ出すカテゴリ（ペイン・タブへのジャンプは件数が多く常時は邪魔） */
export const GOTO_CATEGORY = "Go to";
const RECENT_KEY = "elecxterm-palette-recent";
const RECENT_LIMIT = 5;

interface Match {
  cmd: CommandItem;
  score: number;
  /** label 内で一致した文字の位置（ハイライト用） */
  positions: number[];
}

/**
 * fzf 風のあいまい一致。query の各文字が順番どおりに現れれば一致とし、
 * 連続一致・単語の先頭での一致・ラベル先頭での一致を高く評価する。
 */
export function fuzzyMatch(text: string, query: string): { score: number; positions: number[] } | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, positions: [] };
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const wordStart = found === 0 || /[\s:/\\()\-_.]/.test(t[found - 1]);
    score += 1 + (found === prev + 1 ? 3 : 0) + (wordStart ? 2 : 0) + (found === 0 ? 2 : 0);
    score -= Math.min(found - ti, 6) * 0.15;
    positions.push(found);
    prev = found;
    ti = found + 1;
  }
  return { score, positions };
}

function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(id: string) {
  try {
    const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても実行には影響しない
  }
}

function Highlight({ text, positions }: { text: string; positions: number[] }) {
  if (positions.length === 0) return <>{text}</>;
  const set = new Set(positions);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <span key={i} className="font-semibold text-accent">
            {ch}
          </span>
        ) : (
          <Fragment key={i}>{ch}</Fragment>
        )
      )}
    </>
  );
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    setRecent(loadRecent());
  }, [isOpen]);

  /** 表示するグループ（見出し + 項目）。検索中はスコア順の 1 グループ */
  const groups = useMemo((): { title: string; matches: Match[] }[] => {
    const q = query.trim();
    if (q) {
      const matches = commands
        .map((cmd) => {
          const onLabel = fuzzyMatch(cmd.label, q);
          // カテゴリ・キーワード・パスは長いので、あいまい一致にすると無関係な文字の
          // 寄せ集めで当たってしまう。語ごとの部分一致だけを見る
          const extra = `${cmd.category ?? ""} ${cmd.keywords ?? ""} ${cmd.description ?? ""}`.toLowerCase();
          const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
          const onExtra = terms.length > 0 && terms.every((t) => extra.includes(t));
          if (!onLabel && !onExtra) return null;
          return {
            cmd,
            // ラベルでの一致を優先する
            score: onLabel ? onLabel.score + 1 : q.length * 0.5,
            positions: onLabel?.positions ?? [],
          };
        })
        .filter((m): m is Match => m !== null)
        .sort((a, b) => b.score - a.score);
      return [{ title: "Results", matches }];
    }

    const visible = commands.filter((c) => c.category !== GOTO_CATEGORY);
    const byId = new Map(visible.map((c) => [c.id, c]));
    const recentMatches = recent
      .map((id) => byId.get(id))
      .filter((c): c is CommandItem => !!c)
      .map((cmd) => ({ cmd, score: 0, positions: [] }));

    const categories = new Map<string, Match[]>();
    for (const cmd of visible) {
      const key = cmd.category ?? "Other";
      if (!categories.has(key)) categories.set(key, []);
      categories.get(key)!.push({ cmd, score: 0, positions: [] });
    }
    return [
      ...(recentMatches.length ? [{ title: "Recently used", matches: recentMatches }] : []),
      ...[...categories].map(([title, matches]) => ({ title, matches })),
    ];
  }, [commands, query, recent]);

  const flat = useMemo(() => groups.flatMap((g) => g.matches), [groups]);

  useEffect(() => setSelectedIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const run = (cmd: CommandItem) => {
    saveRecent(cmd.id);
    onClose();
    // パレットを閉じてから実行する（プロンプトを開くコマンドなどがフォーカスを奪えるように）
    requestAnimationFrame(() => cmd.action());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // IME 変換中のキーはパレット操作として扱わない（日本語入力の確定 Enter で実行しない）
    if (e.nativeEvent.isComposing) return;
    const n = flat.length;
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (n) setSelectedIndex((i) => (i + 1) % n);
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      if (n) setSelectedIndex((i) => (i - 1 + n) % n);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      if (n) setSelectedIndex((i) => Math.min(n - 1, i + 8));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 8));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const match = flat[selectedIndex];
      if (match) run(match.cmd);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let flatIndex = -1;

  return (
    <Overlay open={isOpen} onClose={onClose} label="Command palette">
      <div className={`${PANEL_CLASS} max-w-[620px]`}>
        <div className="flex items-center gap-2.5 border-b border-border-dim px-4 py-3">
          <Search size={16} className="text-accent" strokeWidth={2.4} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command, or a pane / tab to jump to…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={flat[selectedIndex] ? `cmd-${flat[selectedIndex].cmd.id}` : undefined}
            spellCheck={false}
            className="flex-1 bg-transparent text-[14px] text-tx-primary outline-none placeholder:text-tx-muted"
          />
          <Kbd keys="Esc" className="opacity-70" />
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" className="no-scrollbar max-h-[min(440px,60vh)] overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-tx-muted">No matching commands</div>
          ) : (
            groups.map(
              (group) =>
                group.matches.length > 0 && (
                  <div key={group.title} className="mb-1">
                    <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-tx-muted">
                      {group.title}
                    </div>
                    {group.matches.map(({ cmd, positions }) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      const isActive = index === selectedIndex;
                      return (
                        <div
                          key={`${group.title}-${cmd.id}`}
                          id={isActive ? `cmd-${cmd.id}` : undefined}
                          data-index={index}
                          role="option"
                          aria-selected={isActive}
                          className={`flex h-9 items-center gap-3 rounded-md px-2.5 ${
                            isActive ? "bg-accent-dim text-tx-primary" : "text-tx-secondary"
                          }`}
                          onMouseMove={() => selectedIndex !== index && setSelectedIndex(index)}
                          onClick={() => run(cmd)}
                        >
                          <span className={`h-4 w-[3px] shrink-0 rounded-full ${isActive ? "bg-accent" : "bg-transparent"}`} />
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            <Highlight text={cmd.label} positions={positions} />
                            {cmd.description && (
                              <span className="ml-2 text-[11.5px] text-tx-muted">{cmd.description}</span>
                            )}
                          </span>
                          {query && cmd.category && (
                            <span className="shrink-0 text-[10.5px] text-tx-muted">{cmd.category}</span>
                          )}
                          {cmd.shortcut && <Kbd keys={cmd.shortcut} className="shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )
            )
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border-dim bg-bg-surface/50 px-4 py-2 text-[11px] text-tx-muted">
          <span className="flex items-center gap-1.5">
            <Kbd keys="↑" />
            <Kbd keys="↓" /> Move
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">
              <CornerDownLeft size={10} />
            </kbd>
            Run
          </span>
          <span className="ml-auto">Tip: type a directory or command name to jump to that pane</span>
        </div>
      </div>
    </Overlay>
  );
}
