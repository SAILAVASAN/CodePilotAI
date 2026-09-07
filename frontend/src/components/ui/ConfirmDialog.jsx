import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
        >
          <motion.div
            className="w-full max-w-sm rounded-xl border border-border-glass bg-bg-surface p-6 shadow-card backdrop-blur-md"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-danger">
              <AlertTriangle size={18} />
              <h3 className="font-heading text-base font-bold text-text-primary">{title}</h3>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-text-secondary">{message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="rounded-lg border border-border-glass px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(239,68,68,0.35)] transition-transform hover:-translate-y-0.5"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
