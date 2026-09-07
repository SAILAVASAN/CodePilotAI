import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, maxWidth = '900px' }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-xl border border-border-glass bg-bg-base shadow-card"
            style={{ maxWidth }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-glass bg-white/[0.02] p-4">
              <span className="truncate pr-4 font-mono text-sm font-semibold text-accent">{title}</span>
              <button
                onClick={onClose}
                className="flex shrink-0 items-center gap-1 rounded-md p-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-text-primary bg-bg-input">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
