import type { ManualPaymentStatus } from '../types';

export interface ParentFormState {
  student_id: number | null;
  parent_name: string;
  fee_type: string;
  installment_label: string;
  amount: string;
  transaction_reference: string;
  transaction_at: string; // local datetime string
  payer_name: string;
  payer_upi: string;
  parent_note: string;
  screenshot: File | null;
}

export type ParentFormErrors = Partial<Record<keyof ParentFormState, string>>;

const UPI_REGEX = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
// UTRs are usually 12 digits; UPI refs vary (12 alphanumeric typical).
// We accept anything that looks like a real reference: 4-32 chars, alnum + dashes.
const TXN_REGEX = /^[A-Za-z0-9\-_/]{4,32}$/;

export function validateParentForm(s: ParentFormState): ParentFormErrors {
  const errors: ParentFormErrors = {};

  if (!s.student_id) errors.student_id = 'Select the student you are paying for.';
  if (!s.parent_name.trim()) errors.parent_name = 'Your name is required.';
  else if (s.parent_name.trim().length < 2) errors.parent_name = 'Enter a valid name.';

  const amt = Number(s.amount);
  if (!s.amount) errors.amount = 'Amount is required.';
  else if (Number.isNaN(amt) || amt <= 0) errors.amount = 'Amount must be a positive number.';
  else if (amt > 10_000_000) errors.amount = 'Amount looks unusually large. Please re-check.';

  if (!s.transaction_reference.trim()) {
    errors.transaction_reference = 'Transaction ID / UTR is required.';
  } else if (!TXN_REGEX.test(s.transaction_reference.trim())) {
    errors.transaction_reference =
      'Use only letters, numbers, dashes, or slashes (4–32 characters).';
  }

  if (!s.transaction_at) {
    errors.transaction_at = 'Pick the date and time of your transaction.';
  } else {
    const when = new Date(s.transaction_at);
    if (Number.isNaN(when.getTime())) {
      errors.transaction_at = 'Date / time is not valid.';
    } else {
      const now = Date.now();
      // Allow up to 6 months back and 1 day forward (clock skew / timezone slack).
      const sixMonths = 1000 * 60 * 60 * 24 * 31 * 6;
      const oneDay = 1000 * 60 * 60 * 24;
      if (when.getTime() < now - sixMonths) {
        errors.transaction_at = 'Transaction date is too far in the past.';
      } else if (when.getTime() > now + oneDay) {
        errors.transaction_at = 'Transaction date cannot be in the future.';
      }
    }
  }

  if (s.payer_upi && !UPI_REGEX.test(s.payer_upi.trim())) {
    errors.payer_upi = 'UPI looks like name@bank (e.g. john@upi).';
  }

  if (s.screenshot) {
    const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!okTypes.includes(s.screenshot.type)) {
      errors.screenshot = 'Screenshot must be a JPG, PNG, WEBP, or PDF file.';
    } else if (s.screenshot.size > 8 * 1024 * 1024) {
      errors.screenshot = 'Screenshot must be smaller than 8 MB.';
    }
  }

  return errors;
}

export const STATUS_COLOR_CLASSES: Record<ManualPaymentStatus, string> = {
  PENDING_VERIFICATION:
    'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
  APPROVED:
    'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  NEED_VERIFICATION:
    'bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300',
  PARTIAL_PAYMENT:
    'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300',
  REJECTED:
    'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300',
  FAILED:
    'bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300',
};

export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  try {
    return amount.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });
  } catch {
    return `₹ ${amount.toFixed(2)}`;
  }
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
