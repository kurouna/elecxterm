import { motion, AnimatePresence } from "framer-motion";
import { Info, AlertCircle, X } from "lucide-react";
import { useEffect } from "react";

interface NotificationOverlayProps {
  message: string | null;
  onClear: () => void;
  type?: "info" | "warning" | "error";
}

export function NotificationOverlay({
  message,
  onClear,
  type = "warning",
}: NotificationOverlayProps) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClear, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, onClear]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
          className="fixed bottom-12 left-1/2 z-[10000] -translate-x-1/2 pointer-events-none"
        >
          <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-bg-glass backdrop-blur-2xl border border-border-dim shadow-2xl pointer-events-auto min-w-[300px] max-w-[90vw]">
            <div className={`p-1.5 rounded-full ${
              type === "info" ? "bg-blue-500/20 text-blue-400" :
              type === "error" ? "bg-red-500/20 text-red-400" :
              "bg-amber-500/20 text-amber-400"
            }`}>
              {type === "error" ? <AlertCircle size={16} /> : <Info size={16} />}
            </div>
            
            <p className="text-[13px] font-medium text-tx-primary flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
              {message}
            </p>

            <button
              onClick={onClear}
              className="p-1 hover:bg-white/5 rounded-full text-tx-muted transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
