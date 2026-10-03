import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CRT_EXIT } from "./ui";

interface FontSizeHudProps {
  fontSize: number;
  /** セッション復元が終わるまでは変化を表示しない（起動時の読み込みで出さないため） */
  enabled: boolean;
}

const HUD_MS = 900;

/** キーボードでフォントサイズを変えたときに画面中央へ一瞬だけ出す表示 */
export function FontSizeHud({ fontSize, enabled }: FontSizeHudProps) {
  const [visible, setVisible] = useState(false);
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (baseline.current === null || baseline.current === fontSize) {
      baseline.current = fontSize;
      return;
    }
    baseline.current = fontSize;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), HUD_MS);
    return () => window.clearTimeout(timer);
  }, [fontSize, enabled]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1100] flex items-center justify-center" role="status" aria-live="polite">
      <AnimatePresence>
        {visible && (
          <motion.div
            key="hud"
            initial={false}
            exit={CRT_EXIT}
            style={{ "--crt-duration": "280ms" } as React.CSSProperties}
            className="crt-on flex items-baseline gap-2 rounded-2xl border border-border-strong bg-bg-glass px-6 py-4 shadow-[var(--shadow-lg)] backdrop-blur-2xl"
          >
            <span className="font-mono text-[13px] text-tx-muted">Aa</span>
            <span className="font-mono text-[28px] font-semibold tabular-nums text-tx-primary">{fontSize}</span>
            <span className="text-[13px] text-tx-muted">px</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
