import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageUp, Loader2, Send, Sparkles, X, CalendarClock, Hash, IndianRupee,
  UserSquare2, Smartphone, NotebookPen, Receipt, ShieldCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { validateParentForm } from '../lib/validation';
import type { ParentFormErrors, ParentFormState } from '../lib/validation';
import type { ManualPaymentStudentRef } from '../types';

interface Props {
  students: ManualPaymentStudentRef[];
  defaultParentName?: string;
  isSubmitting: boolean;
  onSubmit: (s: ParentFormState) => Promise<void>;
}

const FEE_TYPES = ['TUITION', 'TRANSPORT', 'SPORTS'] as const;

const initialState = (parentName: string, studentId: number | null): ParentFormState => ({
  student_id: studentId,
  parent_name: parentName,
  fee_type: 'TUITION',
  installment_label: '',
  amount: '',
  transaction_reference: '',
  transaction_at: '',
  payer_name: '',
  payer_upi: '',
  parent_note: '',
  screenshot: null,
});

function toLocalDatetimeInputValue(d: Date): string {
  // Build YYYY-MM-DDTHH:mm in the local timezone (NOT toISOString — that
  // shifts the date a day in non-UTC zones; see memory).
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PaymentRequestForm({
  students, defaultParentName = '', isSubmitting, onSubmit,
}: Props) {
  const [state, setState] = useState<ParentFormState>(() =>
    initialState(defaultParentName, students[0]?.id ?? null),
  );
  const [errors, setErrors] = useState<ParentFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync student default once on first non-empty list, never override later
  // selections by the parent.
  useEffect(() => {
    if (!state.student_id && students[0]) {
      setState((s) => ({ ...s, student_id: students[0].id }));
    }
  }, [students, state.student_id]);

  useEffect(() => {
    if (defaultParentName && !state.parent_name) {
      setState((s) => ({ ...s, parent_name: defaultParentName }));
    }
  }, [defaultParentName, state.parent_name]);

  const screenshotPreviewUrl = useMemo(() => {
    if (!state.screenshot) return null;
    if (state.screenshot.type === 'application/pdf') return null;
    return URL.createObjectURL(state.screenshot);
  }, [state.screenshot]);

  // Pinned upper bound for the transaction date input. Computed once at mount
  // so the date picker's `max` attribute is stable instead of drifting on
  // every render. Being a few seconds stale is fine for a "yesterday or
  // earlier" sanity guard.
  const maxTransactionDate = useMemo(
    // Date.now is the whole point; useMemo with empty deps means we read it once at mount.
    // eslint-disable-next-line react-hooks/purity
    () => toLocalDatetimeInputValue(new Date(Date.now() + 1000 * 60 * 60 * 24)),
    []
  );

  useEffect(() => {
    return () => {
      if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    };
  }, [screenshotPreviewUrl]);

  const set = <K extends keyof ParentFormState>(k: K, v: ParentFormState[K]) => {
    setState((s) => ({ ...s, [k]: v }));
  };

  const handleBlur = (field: keyof ParentFormState) => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validateParentForm({ ...state }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateParentForm(state);
    setErrors(next);
    setTouched(
      Object.keys(state).reduce<Record<string, boolean>>(
        (acc, k) => ({ ...acc, [k]: true }), {},
      ),
    );
    if (Object.keys(next).length > 0) return;
    await onSubmit(state);
  };

  const fieldClass = (field: keyof ParentFormState) =>
    cn(
      'w-full rounded-2xl border-2 bg-white dark:bg-white/[0.05] px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:outline-none transition-colors',
      errors[field] && touched[field]
        ? 'border-rose-400 focus:border-rose-500'
        : 'border-slate-200 dark:border-white/10 focus:border-primary',
    );

  const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5';

  const fieldError = (k: keyof ParentFormState) =>
    errors[k] && touched[k] ? (
      <p className="mt-1 text-[11px] font-bold text-rose-500">{errors[k]}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Student */}
        <div>
          <label className={labelClass}>Student *</label>
          <select
            value={state.student_id ?? ''}
            onChange={(e) => set('student_id', e.target.value ? Number(e.target.value) : null)}
            onBlur={() => handleBlur('student_id')}
            disabled={students.length === 0}
            className={fieldClass('student_id')}
          >
            {students.length === 0 && (
              <option value="">No students linked to your account</option>
            )}
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {fieldError('student_id')}
        </div>

        {/* Parent name */}
        <div>
          <label className={labelClass}>Your name *</label>
          <div className="relative">
            <UserSquare2 className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={state.parent_name}
              onChange={(e) => set('parent_name', e.target.value)}
              onBlur={() => handleBlur('parent_name')}
              placeholder="e.g. Anita Sharma"
              className={cn(fieldClass('parent_name'), 'pl-10')}
            />
          </div>
          {fieldError('parent_name')}
        </div>

        {/* Fee type */}
        <div>
          <label className={labelClass}>Fee type</label>
          <select
            value={state.fee_type}
            onChange={(e) => set('fee_type', e.target.value)}
            className={fieldClass('fee_type')}
          >
            {FEE_TYPES.map((ft) => (
              <option key={ft} value={ft}>{ft}</option>
            ))}
          </select>
        </div>

        {/* Installment */}
        <div>
          <label className={labelClass}>Installment / period (optional)</label>
          <input
            type="text"
            value={state.installment_label}
            onChange={(e) => set('installment_label', e.target.value)}
            placeholder="e.g. Term 1 / June 2026"
            className={fieldClass('installment_label')}
          />
        </div>

        {/* Amount */}
        <div>
          <label className={labelClass}>Amount paid (₹) *</label>
          <div className="relative">
            <IndianRupee className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step="0.01"
              value={state.amount}
              onChange={(e) => set('amount', e.target.value)}
              onBlur={() => handleBlur('amount')}
              placeholder="0.00"
              className={cn(fieldClass('amount'), 'pl-10')}
            />
          </div>
          {fieldError('amount')}
        </div>

        {/* Transaction ID */}
        <div>
          <label className={labelClass}>Transaction ID / UTR *</label>
          <div className="relative">
            <Hash className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={state.transaction_reference}
              onChange={(e) => set('transaction_reference', e.target.value)}
              onBlur={() => handleBlur('transaction_reference')}
              placeholder="12-digit UTR or UPI reference"
              className={cn(fieldClass('transaction_reference'), 'pl-10 font-mono')}
              autoComplete="off"
            />
          </div>
          {fieldError('transaction_reference')}
        </div>

        {/* Transaction date */}
        <div>
          <label className={labelClass}>Date &amp; time of transaction *</label>
          <div className="relative">
            <CalendarClock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              type="datetime-local"
              value={state.transaction_at}
              max={maxTransactionDate}
              onChange={(e) => set('transaction_at', e.target.value)}
              onBlur={() => handleBlur('transaction_at')}
              className={cn(fieldClass('transaction_at'), 'pl-10')}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => set('transaction_at', toLocalDatetimeInputValue(new Date()))}
              className="underline hover:text-primary"
            >
              Use current time
            </button>
          </div>
          {fieldError('transaction_at')}
        </div>

        {/* Payer name */}
        <div>
          <label className={labelClass}>Payer name (optional)</label>
          <input
            type="text"
            value={state.payer_name}
            onChange={(e) => set('payer_name', e.target.value)}
            placeholder="Name on the paying bank account"
            className={fieldClass('payer_name')}
          />
        </div>

        {/* Payer UPI */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Sender UPI (optional)</label>
          <div className="relative">
            <Smartphone className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={state.payer_upi}
              onChange={(e) => set('payer_upi', e.target.value)}
              onBlur={() => handleBlur('payer_upi')}
              placeholder="e.g. anita@upi"
              className={cn(fieldClass('payer_upi'), 'pl-10 font-mono')}
              autoComplete="off"
            />
          </div>
          {fieldError('payer_upi')}
        </div>

        {/* Note */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Note / remark (optional)</label>
          <div className="relative">
            <NotebookPen className="w-4 h-4 absolute left-4 top-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <textarea
              value={state.parent_note}
              onChange={(e) => set('parent_note', e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Anything the school office should know about this payment"
              className={cn(fieldClass('parent_note'), 'pl-10 resize-none')}
            />
          </div>
        </div>

        {/* Screenshot */}
        <div className="sm:col-span-2">
          <label className={labelClass}>Optional: payment screenshot</label>
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors font-bold text-xs uppercase tracking-widest"
            >
              <ImageUp className="w-4 h-4" />
              {state.screenshot ? 'Replace' : 'Upload'}
            </button>
            {state.screenshot ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs font-bold flex-1 min-w-0">
                <Receipt className="w-4 h-4 shrink-0" />
                <span className="truncate">{state.screenshot.name}</span>
                <button
                  type="button"
                  onClick={() => set('screenshot', null)}
                  className="ml-auto p-1 rounded-full hover:bg-emerald-500/20"
                  aria-label="Remove screenshot"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 self-center">
                JPG / PNG / WEBP / PDF up to 8 MB. The school will manually verify
                the payment in the bank app, so this is only supporting proof.
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                set('screenshot', f);
                handleBlur('screenshot');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
          </div>
          {screenshotPreviewUrl && (
            <motion.img
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              src={screenshotPreviewUrl}
              alt="Screenshot preview"
              className="mt-3 max-h-48 rounded-2xl border border-slate-200 object-contain bg-slate-50"
            />
          )}
          {fieldError('screenshot')}
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-start gap-3 text-indigo-700 dark:text-indigo-300">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <p className="text-[11px] font-bold leading-relaxed">
          Submissions go to the school office for manual verification against the
          school's actual bank/UPI account. You will see your status update once
          the admin reviews it — the official receipt is generated only after approval.
        </p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || students.length === 0}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 disabled:scale-100 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all"
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {isSubmitting ? 'Submitting…' : 'Submit for verification'}
        {!isSubmitting && <Sparkles className="w-4 h-4 opacity-80" />}
      </button>
    </form>
  );
}
