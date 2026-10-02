import { forwardRef, ReactNode } from "react";
import type { ButtonHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PaneStatus } from "../types";
import { shellKind, shellLabel } from "../services/paneInfo";

/** "Ctrl+Shift+K" をキーキャップの並びとして表示する */
export function Kbd({ keys, className = "" }: { keys: string; className?: string }) {
  // "Ctrl+Shift++" のような末尾の + も 1 キーとして扱う
  const parts = keys.split(/\+(?!$)/);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {parts.map((part, i) => (
        <kbd key={i} className="kbd">
          {part}
        </kbd>
      ))}
    </span>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** ツールチップに添えるショートカット */
  shortcut?: string;
  active?: boolean;
  size?: "sm" | "md";
}

/** アイコンのみのボタン。label は aria-label とツールチップの両方に使う */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, size = "md", className = "", children, ...rest },
  ref
) {
  const dim = size === "sm" ? "h-5 w-5 rounded" : "h-7 w-7 rounded-md";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`inline-flex shrink-0 items-center justify-center text-tx-muted transition-colors hover:bg-tx-primary/[0.07] hover:text-tx-primary focus-visible:outline-2 focus-visible:outline-accent ${dim} ${
        active ? "bg-accent-dim text-accent" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

const STATUS_COLOR: Record<PaneStatus, string> = {
  starting: "bg-warning",
  running: "bg-success",
  exited: "bg-tx-muted",
  error: "bg-danger",
};

/** 実行状態を表す小さな点。activity が立っていればアクセント色で強調する */
export function StatusDot({
  status,
  activity,
  className = "",
}: {
  status: PaneStatus;
  activity?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        activity ? "bg-accent shadow-[0_0_6px_var(--accent)]" : STATUS_COLOR[status]
      } ${className}`}
    />
  );
}

/** シェル種別のバッジ（CMD / PS7 など） */
export function ShellBadge({ shell, className = "" }: { shell?: string; className?: string }) {
  const kind = shellKind(shell);
  const tone =
    kind === "cmd"
      ? "text-tx-secondary border-border-strong"
      : kind === "other"
        ? "text-tx-muted border-border-dim"
        : "text-info border-info/40";
  return (
    <span
      className={`inline-flex h-4 shrink-0 items-center rounded border px-1 font-mono text-[9.5px] font-semibold leading-none tracking-wide ${tone} ${className}`}
    >
      {shellLabel(shell)}
    </span>
  );
}

/**
 * モーダルオーバーレイ（背景の減光 + 中身）。クリックで閉じる背景を持つ。
 * 開閉アニメーションを揃えるため、パレット・プロンプト・ヘルプで共有する。
 */
export function Overlay({
  open,
  onClose,
  children,
  align = "top",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "top" | "center";
  label: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`fixed inset-0 z-[1000] flex justify-center px-4 ${
            align === "top" ? "items-start pt-[10vh]" : "items-center"
          }`}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onMouseDown={onClose}
          />
          <motion.div
            className="relative w-full"
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ type: "spring", damping: 30, stiffness: 420 }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** パネル共通の枠（ガラス調の背景・境界線・影） */
export const PANEL_CLASS =
  "mx-auto overflow-hidden rounded-xl border border-border-strong bg-bg-glass shadow-[var(--shadow-lg)] backdrop-blur-2xl";
