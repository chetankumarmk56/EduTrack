import { useEffect } from 'react';
import { Toaster, toast, useToasterStore } from 'react-hot-toast';

/**
 * One toast at a time.
 *
 * The axios response interceptor auto-fires a success/error toast for every
 * mutation, and many screens ALSO fire their own toast for the same action —
 * so a single click could surface two near-identical toasts. We cap the
 * visible toasts to one and dismiss the rest. react-hot-toast keeps the
 * newest toast at the front of the store, so the survivor is the most
 * recently fired one — i.e. the component's specific message wins over the
 * interceptor's generic "… updated successfully".
 */
const MAX_VISIBLE_TOASTS = 1;

export default function ToastHub() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= MAX_VISIBLE_TOASTS)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);

  return <Toaster position="top-right" />;
}
