import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  /**
   * When set, the user must type this exact string (case-sensitive)
   * before the confirm button becomes enabled. Use for destructive,
   * irreversible operations where an accidental click could destroy
   * meaningful data.
   */
  requireConfirmText?: string;
  /** Hint shown under the confirm-text input. */
  requireConfirmHint?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_STYLES: Record<ConfirmTone, { icon: string; button: string; ring: string }> = {
  danger: {
    icon: 'bg-rose-500/12 text-rose-500',
    button: 'bg-rose-600 hover:bg-rose-500 text-white',
    ring: 'ring-rose-500/15',
  },
  warning: {
    icon: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    button: 'bg-amber-600 hover:bg-amber-500 text-white',
    ring: 'ring-amber-500/15',
  },
  primary: {
    icon: 'bg-primary/12 text-primary',
    button: 'bg-primary hover:opacity-90 text-white',
    ring: 'ring-primary/15',
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
  requireConfirmText,
  requireConfirmHint,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [confirmInput, setConfirmInput] = useState('');
  // React-recommended "reset state on prop change" pattern — track the
  // previous `open`/`requireConfirmText` during render so we don't pay
  // an extra effect commit just to wipe the input.
  const [prevOpenKey, setPrevOpenKey] = useState<string>(`${open}|${requireConfirmText ?? ''}`);
  const nextOpenKey = `${open}|${requireConfirmText ?? ''}`;
  if (prevOpenKey !== nextOpenKey) {
    setPrevOpenKey(nextOpenKey);
    if (open) setConfirmInput('');
  }

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
  const confirmGated = !!requireConfirmText && confirmInput !== requireConfirmText;

  // Portal into <body> so we escape any transformed ancestor
  // (e.g. the route-transition PageWrapper) — otherwise `position: fixed`
  // pins to the content area, not the actual viewport.
  const tree = (
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
            className="absolute inset-0 modal-scrim cursor-default disabled:cursor-not-allowed"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            initial={{ scale: 0.97, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'modal-panel relative w-full max-w-md',
              t.ring && 'ring-2',
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

            {requireConfirmText && (
              <div className="px-6 pb-4 space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                  Type <span className="font-mono text-rose-500">{requireConfirmText}</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={e => setConfirmInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isLoading}
                  className={cn(
                    'w-full h-10 px-3 rounded-xl border bg-white dark:bg-slate-900 text-sm font-mono tracking-wide',
                    'text-slate-900 dark:text-white placeholder:text-slate-400',
                    confirmGated
                      ? 'border-slate-300 dark:border-white/10 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-500/30'
                      : 'border-emerald-400 ring-2 ring-emerald-100 dark:ring-emerald-500/20',
                    'outline-none transition-colors',
                  )}
                  placeholder={requireConfirmText}
                />
                {requireConfirmHint && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {requireConfirmHint}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-glass-border modal-section rounded-b-2xl">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="modal-btn-secondary"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading || confirmGated}
                title={confirmGated ? `Type ${requireConfirmText} to enable` : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
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

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}
