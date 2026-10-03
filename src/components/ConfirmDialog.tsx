import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Kbd, Overlay, PANEL_CLASS } from "./ui";

export interface ConfirmRequest {
  title: string;
  message: string;
  /** 補足として等幅で並べる項目（実行中のコマンドなど） */
  items?: string[];
  confirmLabel: string;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onClose: () => void;
}

/** 破壊的な操作の確認ダイアログ（Enter で実行 / Esc で取り消し） */
export function ConfirmDialog({ request, onClose }: ConfirmDialogProps) {
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        request.onConfirm();
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [request, onClose]);

  return (
    <Overlay open={request !== null} onClose={onClose} align="center" label={request?.title ?? "Confirm"} zIndex={1050} width={440}>
      <div className={PANEL_CLASS}>
        <div className="flex gap-3 px-5 pb-3 pt-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-tx-primary">{request?.title}</div>
            <div className="mt-1 text-[12.5px] text-tx-secondary">{request?.message}</div>
            {request?.items && request.items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {request.items.map((item, i) => (
                  <li key={i} className="truncate rounded bg-bg-main px-2 py-1 font-mono text-[11.5px] text-tx-primary">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-dim bg-bg-surface/50 px-5 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] text-tx-secondary hover:bg-tx-primary/[0.07]"
          >
            Cancel <Kbd keys="Esc" className="opacity-60" />
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              request?.onConfirm();
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-1 text-[12.5px] font-medium text-white hover:opacity-90"
          >
            {request?.confirmLabel} <Kbd keys="Enter" className="opacity-80" />
          </button>
        </div>
      </div>
    </Overlay>
  );
}
