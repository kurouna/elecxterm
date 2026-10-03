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
  width,
  zIndex = 1000,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "top" | "center";
  label: string;
  /**
   * パネルの最大幅（px）。演出（電源オン・オフ）はこの幅の中だけに掛かる。
   * 幅を決めずに画面幅いっぱいの要素へ掛けると、走査線やビームがウィンドウ全体に出てしまう。
   */
  width: number;
  /** 他のオーバーレイ（概要表示など）の上に重ねたいときに上げる */
  zIndex?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          style={{ zIndex }}
          className={`fixed inset-0 flex justify-center px-4 ${
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
            style={{ maxWidth: width }}
            initial={false}
            exit={CRT_EXIT}
          >
            {/* 開くときは CRT の電源オン（styles/crt.css）、閉じるときは横線に潰れて消える。
                どちらもパネルの大きさの要素に掛け、画面全体には広げない */}
            <div className="crt-on rounded-xl" style={{ "--crt-duration": "420ms" } as React.CSSProperties}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * CRT の電源オフを framer-motion の exit で表したもの（styles/crt.css の crt-power-off と同じ形）。
 * AnimatePresence で外れる要素はクラスを付け替えられないので、こちらで再生する。
 */
export const CRT_EXIT = {
  scaleY: [1, 0.006, 0.006],
  scaleX: [1, 1, 0],
  opacity: [1, 1, 0],
  filter: ["brightness(1)", "brightness(3.5)", "brightness(6)"],
  transition: { duration: 0.26, times: [0, 0.55, 1], ease: "easeIn" as const },
};

/**
 * タブ上端のラインの電源オン／オフ（ラインそのものが CRT の走査線のように振る舞う）。
 * オンは中央から左右に伸び、少し行き過ぎて収まる。オフは中央の光る点に縮んで消える。
 */
export const LINE_ON = {
  initial: { scaleX: 0, opacity: 0, filter: "brightness(3)" },
  animate: { scaleX: 1, filter: "brightness(1)" },
  transition: { duration: 0.32, ease: [0.34, 1.56, 0.64, 1] as const },
};
export const LINE_OFF = {
  scaleX: [1, 0.06, 0],
  scaleY: [1, 2, 2],
  opacity: [1, 1, 0],
  filter: ["brightness(1)", "brightness(4)", "brightness(6)"],
  transition: { duration: 0.26, times: [0, 0.6, 1], ease: "easeIn" as const },
};

/** タブのチップを閉じるとき: 先にラインが縮み始めてから、チップ全体が横線に潰れる */
export const TAB_EXIT = { ...CRT_EXIT, transition: { ...CRT_EXIT.transition, delay: 0.1 } };

/** パネル共通の枠（ガラス調の背景・境界線・影） */
export const PANEL_CLASS =
  "mx-auto overflow-hidden rounded-xl border border-border-strong bg-bg-glass shadow-[var(--shadow-lg)] backdrop-blur-2xl";
