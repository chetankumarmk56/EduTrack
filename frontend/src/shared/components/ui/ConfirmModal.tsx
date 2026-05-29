import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ConfirmTone = 'danger' | 'warning' | 'primary';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  isLoading?: boolean;
  /** Optional secondary content rendered between description and buttons. */
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_STYLES: Record<ConfirmTone, { icon: string; button: string; ring: string }> = {
  danger: {
    icon: 'bg-rose-500/15 text-rose-500',
    button: 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/20',
    ring: 'ring-rose-500/20',
  },
  warning: {
    icon: 'bg-amber-500/15 text-amber-500',
    button: 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20',
    ring: 'ring-amber-500/20',
  },
  primary: {
    icon: 'bg-primary/15 text-primary',
    button: 'bg-primary hover:opacity-90 text-white shadow-lg',
    ring: 'ring-primary/20',
  },
};

/**
 * Theme-aware confirmation dialog. The backdrop sits at a moderate opacity
 * with a subtle blur so the page underneath stays visible, and body scroll
 * is locked while it's open to avoid the previously-reported "infinite
 * blank scroll" issue when modals didn't lock the page.
 */
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isLoading,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Lock body scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc to dismiss
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isLoading, onCancel]);

  const t = TONE_STYLES[tone];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] grid place-items-center p-4 sm:p-6">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            disabled={isLoading}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px] cursor-default disabled:cursor-not-allowed"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              'relative w-full max-w-md rounded-2xl border border-glass-border',
              'bg-white dark:bg-slate-900 shadow-2xl ring-4',
              t.ring,
            )}
          >
            <div className="flex items-start gap-4 p-6 pb-4">
              <div className={cn('h-10 w-10 rounded-xl grid place-items-center shrink-0', t.icon)}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="confirm-modal-title"
                  className="text-base font-black tracking-tight text-slate-900 dark:text-white"
                >
                  {title}
                </h3>
                {description && (
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="p-1.5 -mt-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {children && <div className="px-6 pb-4">{children}</div>}

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-glass-border bg-slate-50/60 dark:bg-white/[0.02] rounded-b-2xl">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="px-4 h-10 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={cn(
                  'inline-flex items-center gap-2 px-5 h-10 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed',
                  t.button,
                )}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
