import { useEffect } from "react";
import { Keyboard } from "lucide-react";
import { SHORTCUT_GROUPS } from "../keymap";
import { Kbd, Overlay, PANEL_CLASS } from "./ui";

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

/** キーボードショートカットの一覧（Ctrl+Shift+?） */
export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <Overlay open={open} onClose={onClose} align="center" label="Keyboard shortcuts">
      <div className={`${PANEL_CLASS} max-w-[860px]`}>
        <div className="flex items-center gap-2 border-b border-border-dim px-5 py-3">
          <Keyboard size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-tx-primary">Keyboard shortcuts</span>
          <span className="ml-auto text-[11px] text-tx-muted">
            Everything is also searchable in the command palette
          </span>
        </div>
        <div className="grid max-h-[70vh] grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 md:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-tx-muted">{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3 border-b border-border-dim/60 py-1.5 text-[12.5px] text-tx-secondary last:border-0">
                    <span>{item.label}</span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {item.keys.map((k) =>
                        k.includes("+") ? <Kbd key={k} keys={k} /> : <span key={k} className="text-[11px] text-tx-muted">{k === "Enter" ? <Kbd keys="Enter" /> : k}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
