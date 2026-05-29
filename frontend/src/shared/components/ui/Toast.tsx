import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms before auto-dismiss. 0 disables auto-dismiss. */
  duration?: number;
}

interface ToastRecord extends ToastInput {
  id: number;
}

interface ToastContextValue {
  push: (toast: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string; bar: string }> = {
  success: {
    ring: 'ring-emerald-500/20',
    icon: 'text-emerald-500',
    bar: 'bg-emerald-500',
  },
  error: {
    ring: 'ring-rose-500/25',
    icon: 'text-rose-500',
    bar: 'bg-rose-500',
  },
  info: {
    ring: 'ring-primary/20',
    icon: 'text-primary',
    bar: 'bg-primary',
  },
};

/**
 * Lightweight toast system. Sits at the top of the app tree.
 * Avoids the layout-shifting inline banners we previously used for
 * "Added 2 section(s)…" success messages.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((input: ToastInput) => {
    const id = ++nextId.current;
    const record: ToastRecord = {
      id,
      tone: 'success',
      duration: 4000,
      ...input,
    };
    setToasts(prev => [...prev, record]);
    if (record.duration && record.duration > 0) {
      window.setTimeout(() => dismiss(id), record.duration);
    }
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    push,
    success: (title, description) => push({ title, description, tone: 'success' }),
    error: (title, description) => push({ title, description, tone: 'error', duration: 6000 }),
    info: (title, description) => push({ title, description, tone: 'info' }),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Read the toast context. Falls back to no-op functions when no
 * provider is mounted so calling code doesn't have to defensively
 * check. Co-located with the provider so consumers grab both from
 * one import.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  // Defensive fallback — log to console so missing provider isn't silent.
  const warn = (title: string, description?: string) =>
    console.warn('[toast]', title, description ?? '');
  return {
    push: ({ title, description }) => warn(title, description),
    success: warn,
    error: warn,
    info: warn,
  };
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: number) => void }) {
  // Esc dismisses the most recent toast
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toasts.length > 0) {
        onDismiss(toasts[toasts.length - 1].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toasts, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-5 right-5 z-[300] flex flex-col gap-3 w-[calc(100vw-2.5rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map(t => {
          const tone = (t.tone ?? 'success') as ToastTone;
          const Icon = ICONS[tone];
          const styles = TONE_STYLES[tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className={cn(
                'pointer-events-auto relative overflow-hidden rounded-2xl border border-glass-border',
                'bg-white dark:bg-slate-900 shadow-2xl ring-2',
                styles.ring,
              )}
            >
              <div className={cn('absolute left-0 top-0 bottom-0 w-1', styles.bar)} />
              <div className="flex items-start gap-3 px-4 py-3 pl-5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', styles.icon)} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-slate-900 dark:text-white leading-snug">
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300 leading-snug">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(t.id)}
                  className="p-1 -mt-0.5 -mr-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
