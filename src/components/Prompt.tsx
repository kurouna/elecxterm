import { useState, useEffect } from "react";
import { CornerDownLeft } from "lucide-react";
import { Kbd, Overlay, PANEL_CLASS } from "./ui";

export interface PromptRequest {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
}

interface PromptProps {
  request: PromptRequest | null;
  onClose: () => void;
}

/** 1 行入力のダイアログ（開始ディレクトリ・フォントなどの設定に使う） */
export function Prompt({ request, onClose }: PromptProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (request) setValue(request.defaultValue ?? "");
  }, [request]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME 変換確定の Enter を送信として扱わない（日本語入力での誤送信防止）
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      request?.onSubmit(value);
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <Overlay open={request !== null} onClose={onClose} label={request?.title ?? "Prompt"}>
      <div className={`${PANEL_CLASS} max-w-[560px]`}>
        <div className="px-5 pb-1 pt-4">
          <div className="text-[13.5px] font-semibold text-tx-primary">{request?.title}</div>
          {request?.description && <div className="mt-0.5 text-[12px] text-tx-muted">{request.description}</div>}
        </div>
        <div className="px-5 py-3">
          <input
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={request?.placeholder}
            spellCheck={false}
            aria-label={request?.title}
            className="h-9 w-full rounded-lg border border-border-strong bg-bg-main px-3 font-mono text-[13px] text-tx-primary outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-dim)] placeholder:text-tx-muted"
          />
        </div>
        <div className="flex items-center justify-end gap-4 border-t border-border-dim bg-bg-surface/50 px-5 py-2 text-[11px] text-tx-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">
              <CornerDownLeft size={10} />
            </kbd>
            Confirm
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd keys="Esc" /> Cancel
          </span>
        </div>
      </div>
    </Overlay>
  );
}
