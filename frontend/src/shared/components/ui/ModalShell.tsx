import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
};

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  size?: Size;
  /** When true, Esc and outside-click are disabled (used while a submit is in flight). */
  locked?: boolean;
  /** Optional ID of the element labelling the dialog for a11y. */
  labelledBy?: string;
  /** Extra classes applied to the panel container. */
  className?: string;
  children: ReactNode;
}

/**
 * Shared dialog primitive. Provides a soft scrim, theme-aware solid
 * panel, body-scroll lock, Esc-to-dismiss, and a centered flex layout.
 *
 * The panel itself is a vertical flex container — pages compose their
 * own header / body / footer rows inside it (see `ModalHeader`,
 * `ModalBody`, `ModalFooter` for the standard slot styles).
 */
export default function ModalShell({
  open,
  onClose,
  size = 'lg',
  locked,
  labelledBy,
  className,
  children,
}: ModalShellProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, locked]);

  // Render through a portal directly into <body>. Any ancestor with
  // `transform`, `filter`, or `perspective` becomes the containing
  // block for `position: fixed` descendants — `PageWrapper` (the
  // route-transition motion.div) leaves a `transform` on itself even
  // after the animation finishes, which would pin the modal inside
  // the main content area instead of the viewport.
  const tree = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            disabled={locked}
            onClick={() => !locked && onClose()}
            className="fixed inset-0 modal-scrim cursor-default disabled:cursor-not-allowed"
          />
          <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              initial={{ opacity: 0, scale: 0.97, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'modal-panel relative w-full pointer-events-auto flex flex-col overflow-hidden',
                'max-h-[min(86vh,820px)]',
                SIZE_CLASSES[size],
                className,
              )}
            >
              {children}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}

/** Sticky header row. Title left, optional close button right. */
export function ModalHeader({
  title,
  subtitle,
  icon,
  onClose,
  trailing,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  trailing?: ReactNode;
  id?: string;
}) {
  return (
    <header className="shrink-0 flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-glass-border">
      {icon && (
        <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-brand-indigo/10 border border-brand-indigo/20 grid place-items-center text-brand-indigo">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h2
          id={id}
          className="text-[15px] sm:text-base font-bold tracking-tight text-foreground truncate"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-text-secondary text-[12px] mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {trailing}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 -mt-1 -mr-1.5 w-8 h-8 grid place-items-center rounded-lg text-text-secondary hover:text-foreground hover:bg-white/[0.06] dark:hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <span className="block w-4 h-4">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      )}
    </header>
  );
}

/** Scrollable body region. Adjust padding via `className` if needed. */
export function ModalBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4', className)}>
      {children}
    </div>
  );
}

/** Sticky footer row. Use `leading` for status text, children for actions. */
export function ModalFooter({
  leading,
  children,
  className,
}: {
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        'shrink-0 flex items-center gap-2 px-5 sm:px-6 py-3 border-t border-glass-border modal-section',
        className,
      )}
    >
      {leading && (
        <div className="text-[11px] text-text-secondary hidden sm:flex items-center min-w-0 flex-1 truncate">
          {leading}
        </div>
      )}
      <div className={cn('flex items-center gap-2', leading ? '' : 'ml-auto')}>{children}</div>
    </footer>
  );
}
