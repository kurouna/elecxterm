import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { KEYS } from "../keymap";
import { Kbd } from "./ui";

const STORAGE_KEY = "elecxterm-welcomed";

const TIPS: { keys: string; label: string }[] = [
  { keys: KEYS.overview, label: "See every pane across all tabs" },
  { keys: KEYS.quickSwitch, label: "Jump back to your previous pane" },
  { keys: KEYS.palette, label: "Run any command" },
  { keys: KEYS.settings, label: "Themes, fonts, colors and more" },
];

function alreadyWelcomed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

interface WelcomeCardProps {
  /** セッション復元後に出す */
  ready: boolean;
  onShowShortcuts: () => void;
}

/** 初回起動時だけ表示する、主要ショートカットの紹介カード */
export function WelcomeCard({ ready, onShowShortcuts }: WelcomeCardProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || alreadyWelcomed()) return;
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 保存できなくても閉じる
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
          transition={{ type: "spring", damping: 28, stiffness: 340 }}
          role="dialog"
          aria-label="Welcome to elecxterm"
          className="fixed bottom-10 right-5 z-[950] w-[340px] overflow-hidden rounded-xl border border-border-strong bg-bg-glass shadow-[var(--shadow-lg)] backdrop-blur-2xl"
        >
          <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
            <Sparkles size={15} className="text-accent" />
            <span className="text-[13.5px] font-semibold text-tx-primary">Welcome to elecxterm</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="ml-auto rounded p-0.5 text-tx-muted hover:bg-tx-primary/[0.07] hover:text-tx-primary"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="space-y-2 px-4 pb-3">
            {TIPS.map((tip) => (
              <li key={tip.keys} className="flex items-center justify-between gap-3 text-[12px] text-tx-secondary">
                <span>{tip.label}</span>
                <Kbd keys={tip.keys} className="shrink-0" />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border-dim bg-bg-surface/50 px-4 py-2">
            <button
              type="button"
              onClick={() => {
                dismiss();
                onShowShortcuts();
              }}
              className="text-[12px] text-accent hover:underline"
            >
              All shortcuts
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-accent-contrast hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
