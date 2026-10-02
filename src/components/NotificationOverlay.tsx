import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** 補足（コマンド名・所要時間など） */
  detail?: string;
  action?: ToastAction;
}

interface NotificationOverlayProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const TOAST_MS = 3800;
/** 操作ボタン付きのトーストは読む・押す時間を長めに取る */
const ACTION_TOAST_MS = 8000;

const ICON: Record<ToastType, React.ReactNode> = {
  info: <Info size={15} className="text-info" />,
  success: <CheckCircle2 size={15} className="text-success" />,
  warning: <AlertCircle size={15} className="text-warning" />,
  error: <AlertCircle size={15} className="text-danger" />,
};

/** 画面下部に積み重なるトースト通知 */
export function NotificationOverlay({ toasts, onDismiss }: NotificationOverlayProps) {
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[1100] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.action ? ACTION_TOAST_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.action, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      className="pointer-events-auto flex min-w-[280px] max-w-[min(560px,90vw)] items-center gap-3 rounded-xl border border-border-strong bg-bg-glass px-4 py-2.5 shadow-[var(--shadow-lg)] backdrop-blur-2xl"
    >
      {ICON[toast.type]}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-tx-primary">{toast.message}</p>
        {toast.detail && <p className="truncate font-mono text-[11px] text-tx-muted">{toast.detail}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
          className="shrink-0 rounded-md bg-accent-dim px-2 py-0.5 text-[12px] font-medium text-accent hover:bg-accent hover:text-accent-contrast"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="rounded p-0.5 text-tx-muted hover:bg-tx-primary/[0.07] hover:text-tx-primary"
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}
