import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ImageUp, Info, Landmark, Loader2,
  QrCode, Save, Smartphone, Trash2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/shared/lib/utils';
import { manualPaymentsApi } from '../api';
import type {
  InstitutionPaymentSettings, InstitutionPaymentSettingsUpdate,
} from '../types';
import { formatDateTime } from '../lib/validation';

/**
 * Admin-side editor for per-institution payment settings.
 *
 * Each school manages its own UPI ID, bank account, QR image, and
 * payment instructions. Data lives in `institution_payment_settings`
 * keyed by institution_id; no env config is involved.
 */

interface Props {
  className?: string;
}

interface FormState {
  upi_id: string;
  upi_display_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_account_holder: string;
  payment_instructions: string;
}

const blankForm = (): FormState => ({
  upi_id: '',
  upi_display_name: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_account_holder: '',
  payment_instructions: '',
});

const fromSettings = (s: InstitutionPaymentSettings): FormState => ({
  upi_id: s.upi_id || '',
  upi_display_name: s.upi_display_name || '',
  bank_name: s.bank_name || '',
  bank_account_number: s.bank_account_number || '',
  bank_ifsc: s.bank_ifsc || '',
  bank_account_holder: s.bank_account_holder || '',
  payment_instructions: s.payment_instructions || '',
});

const UPI_REGEX = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function validate(state: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (state.upi_id && !UPI_REGEX.test(state.upi_id.trim())) {
    errors.upi_id = 'UPI looks like name@bank (e.g. school@hdfcbank).';
  }
  if (state.bank_ifsc && !IFSC_REGEX.test(state.bank_ifsc.trim().toUpperCase())) {
    errors.bank_ifsc = 'IFSC should be 11 chars: 4 letters + 0 + 6 alphanumerics.';
  }
  if (state.bank_account_number) {
    const cleaned = state.bank_account_number.replace(/\s+/g, '');
    if (cleaned.length < 6 || cleaned.length > 30 || !/^[\dA-Za-z]+$/.test(cleaned)) {
      errors.bank_account_number = 'Account number should be 6–30 digits/letters.';
    }
  }
  return errors;
}

export default function SchoolPaymentSettingsForm({ className }: Props) {
  const [settings, setSettings] = useState<InstitutionPaymentSettings | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [dirty, setDirty] = useState(false);
  const qrInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await manualPaymentsApi.getAdminSettings();
      setSettings(data);
      setForm(fromSettings(data));
      setDirty(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSaving(true);
    try {
      const payload: InstitutionPaymentSettingsUpdate = {
        upi_id: form.upi_id.trim() || null,
        upi_display_name: form.upi_display_name.trim() || null,
        bank_name: form.bank_name.trim() || null,
        bank_account_number: form.bank_account_number.replace(/\s+/g, '') || null,
        bank_ifsc: form.bank_ifsc.trim().toUpperCase() || null,
        bank_account_holder: form.bank_account_holder.trim() || null,
        payment_instructions: form.payment_instructions.trim() || null,
      };
      const updated = await manualPaymentsApi.updateAdminSettings(payload);
      setSettings(updated);
      setForm(fromSettings(updated));
      setDirty(false);
      toast.success('Payment settings saved. Parents will see them on the next refresh.');
    } catch {
      // toast already shown
    } finally {
      setIsSaving(false);
    }
  };

  const handleQrUpload = async (file: File) => {
    const okTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!okTypes.includes(file.type)) {
      toast.error('QR must be a PNG, JPG, or WEBP image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('QR image must be smaller than 4 MB.');
      return;
    }
    setIsUploadingQr(true);
    try {
      const updated = await manualPaymentsApi.uploadQr(file);
      setSettings(updated);
    } catch {
      // toast already shown
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleQrRemove = async () => {
    if (!settings?.qr_image_url) return;
    if (!confirm('Remove the current QR image? Parents will no longer see a scan option.')) return;
    setIsUploadingQr(true);
    try {
      const updated = await manualPaymentsApi.removeQr();
      setSettings(updated);
    } catch {
      // ignore
    } finally {
      setIsUploadingQr(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('rounded-3xl border border-slate-200 dark:border-white/10 p-10 flex items-center justify-center', className)}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Status banner */}
      {settings && !settings.is_configured && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-black uppercase tracking-widest text-[10px] mb-1">Not configured</p>
            <p>Parents won't see a UPI / bank option on the new payment page until you fill these out.</p>
          </div>
        </div>
      )}
      {settings?.is_configured && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-xs flex-1">
            <p className="font-black uppercase tracking-widest text-[10px] mb-1">Live</p>
            <p>
              Parents of <strong>{settings.school_name}</strong> can pay directly via the configured channels.
              {settings.updated_at && (
                <>
                  {' '}Last updated {formatDateTime(settings.updated_at)}
                  {settings.updated_by_name && ` by ${settings.updated_by_name}`}.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-5">
        {/* ── Form ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-md p-5 sm:p-6 space-y-5">
          <Section title="UPI" icon={<Smartphone className="w-4 h-4" />}>
            <Field label="UPI ID" error={errors.upi_id} hint="Used for direct UPI transfers.">
              <input
                type="text"
                value={form.upi_id}
                onChange={(e) => set('upi_id', e.target.value)}
                placeholder="e.g. school@hdfcbank"
                className="settings-input font-mono"
                autoComplete="off"
                inputMode="email"
              />
            </Field>
            <Field label="Display name" hint="Shown to parents next to the UPI ID.">
              <input
                type="text"
                value={form.upi_display_name}
                onChange={(e) => set('upi_display_name', e.target.value)}
                placeholder="e.g. ABC School Trust"
                className="settings-input"
              />
            </Field>
          </Section>

          <Section title="Bank account" icon={<Landmark className="w-4 h-4" />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Bank name">
                <input
                  type="text"
                  value={form.bank_name}
                  onChange={(e) => set('bank_name', e.target.value)}
                  placeholder="e.g. HDFC Bank"
                  className="settings-input"
                />
              </Field>
              <Field label="Account holder">
                <input
                  type="text"
                  value={form.bank_account_holder}
                  onChange={(e) => set('bank_account_holder', e.target.value)}
                  placeholder="e.g. ABC School Trust"
                  className="settings-input"
                />
              </Field>
              <Field label="Account number" error={errors.bank_account_number}>
                <input
                  type="text"
                  value={form.bank_account_number}
                  onChange={(e) => set('bank_account_number', e.target.value)}
                  placeholder="6–30 digits"
                  className="settings-input font-mono"
                  autoComplete="off"
                />
              </Field>
              <Field label="IFSC" error={errors.bank_ifsc}>
                <input
                  type="text"
                  value={form.bank_ifsc}
                  onChange={(e) => set('bank_ifsc', e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                  className="settings-input font-mono uppercase"
                  autoComplete="off"
                  maxLength={11}
                />
              </Field>
            </div>
          </Section>

          <Section title="Payment instructions" icon={<Info className="w-4 h-4" />}>
            <Field
              label="Note shown to parents"
              hint="Use this to mention reference notes, office hours, escalation contacts, etc."
            >
              <textarea
                value={form.payment_instructions}
                onChange={(e) => set('payment_instructions', e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="e.g. Use the student admission number as the UPI note so we can match it faster."
                className="settings-input resize-none"
              />
            </Field>
          </Section>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 disabled:opacity-50 disabled:scale-100 active:scale-95 transition-all"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save settings
            </button>
            {dirty && (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        {/* ── QR upload ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-md p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
              QR image
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Upload a UPI QR image you've generated from your bank app — parents will be able to scan it to pay directly.
          </p>

          {settings?.qr_image_url ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-4 flex items-center justify-center">
                <img
                  src={settings.qr_image_url}
                  alt="School payment QR"
                  className="max-h-56 object-contain"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => qrInputRef.current?.click()}
                  disabled={isUploadingQr}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 dark:border-white/10 text-xs font-black uppercase tracking-widest hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {isUploadingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />}
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleQrRemove}
                  disabled={isUploadingQr}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-rose-500/30 text-rose-600 text-xs font-black uppercase tracking-widest hover:bg-rose-500/5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => qrInputRef.current?.click()}
              disabled={isUploadingQr}
              className="w-full p-8 rounded-2xl border-2 border-dashed border-primary/40 text-primary flex flex-col items-center gap-2 hover:bg-primary/5 transition-colors"
            >
              {isUploadingQr ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <ImageUp className="w-6 h-6" />
              )}
              <p className="text-xs font-black uppercase tracking-widest">Upload QR image</p>
              <p className="text-[11px] text-muted-foreground">PNG / JPG / WEBP up to 4 MB</p>
            </button>
          )}

          <input
            ref={qrInputRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleQrUpload(f);
              if (qrInputRef.current) qrInputRef.current.value = '';
            }}
          />
        </div>
      </div>

      <style>{`
        .settings-input {
          width: 100%;
          padding: 0.75rem 0.95rem;
          border-radius: 1rem;
          border: 1.5px solid rgb(226 232 240 / 0.7);
          background: white;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground, #0f172a);
          transition: border-color 150ms;
        }
        .dark .settings-input {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.1);
          color: #f1f5f9;
        }
        .settings-input:focus { outline: none; border-color: rgb(99 102 241); }
      `}</style>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-foreground">
        {icon}
        <h4 className="text-xs font-black uppercase tracking-widest">{title}</h4>
      </div>
      <div className="space-y-3 pl-6">{children}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-bold text-rose-500 flex items-center gap-1">
          <X className="w-3 h-3" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
