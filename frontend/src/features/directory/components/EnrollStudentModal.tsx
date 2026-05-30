import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, UserPlus, User, ShieldCheck, ArrowRight, ArrowLeft,
  AlertCircle, Loader, CheckCircle2,
} from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import { useToast } from '@/shared/components/ui/Toast';

interface EnrollStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSchoolClassId: number | null;
  onEnrolled: () => void;
}

interface EnrollForm {
  name: string;
  dob: string;
  whatsapp: string;
  address: string;
  blood_group: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  parent_secondary_phone: string;
}

const EMPTY_FORM: EnrollForm = {
  name: '', dob: '', whatsapp: '', address: '', blood_group: '',
  parent_name: '', parent_email: '', parent_phone: '', parent_secondary_phone: '',
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]{1,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StepKey = 'student' | 'guardian';
const STEP_ORDER: StepKey[] = ['student', 'guardian'];

/**
 * Field-by-field validation. Returns an object keyed by field name with
 * a string when the field has an issue and `undefined` when it's fine.
 *
 * We expose `fieldsForStep` so the wizard can check only the visible
 * step before letting the user advance.
 */
function validateField(field: keyof EnrollForm, value: string, form: EnrollForm): string | undefined {
  switch (field) {
    case 'name': {
      const v = value.trim();
      if (!v) return 'Student name is required.';
      if (v.length < 2) return 'Name must be at least 2 characters.';
      if (!NAME_REGEX.test(v)) return "Letters, spaces, and . ' - only.";
      return undefined;
    }
    case 'dob': {
      if (!value) return 'Date of birth is required.';
      const dobDate = new Date(value);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (Number.isNaN(dobDate.getTime())) return 'Invalid date.';
      if (dobDate >= today) return 'Must be in the past.';
      const ageYears = (today.getTime() - dobDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears < 3) return 'Student must be at least 3 years old.';
      if (ageYears > 25) return 'Date of birth seems too old.';
      return undefined;
    }
    case 'whatsapp': {
      const digits = (value.match(/\d/g) || []).length;
      if (!value.trim()) return 'WhatsApp number is required.';
      if (digits < 10) return 'Enter a complete number (min 10 digits).';
      if (digits > 15) return 'Number is too long (max 15 digits).';
      return undefined;
    }
    case 'parent_name': {
      const v = value.trim();
      if (!v) return 'Guardian name is required.';
      if (v.length < 2) return 'Name must be at least 2 characters.';
      if (!NAME_REGEX.test(v)) return "Letters, spaces, and . ' - only.";
      return undefined;
    }
    case 'parent_email': {
      if (!value.trim()) return 'Email is required.';
      if (!EMAIL_REGEX.test(value.trim())) return 'Invalid email format.';
      return undefined;
    }
    case 'parent_phone': {
      const digits = (value.match(/\d/g) || []).length;
      if (!value.trim()) return 'Phone is required for portal login.';
      if (digits < 10) return 'Enter a complete number (min 10 digits).';
      if (digits > 15) return 'Number is too long (max 15 digits).';
      return undefined;
    }
    case 'parent_secondary_phone': {
      // Optional fallback/emergency number — only validate when provided.
      if (!value.trim()) return undefined;
      const digits = (value.match(/\d/g) || []).length;
      if (digits < 10) return 'Enter a complete number (min 10 digits).';
      if (digits > 15) return 'Number is too long (max 15 digits).';
      return undefined;
    }
    // address and blood_group are optional and free-form — no validation.
    case 'address':
    case 'blood_group':
      return undefined;
  }
}

const FIELDS_FOR_STEP: Record<StepKey, (keyof EnrollForm)[]> = {
  student: ['name', 'dob', 'whatsapp', 'address', 'blood_group'],
  guardian: ['parent_name', 'parent_email', 'parent_phone', 'parent_secondary_phone'],
};

export default function EnrollStudentModal({
  isOpen, onClose, selectedSchoolClassId, onEnrolled,
}: EnrollStudentModalProps) {
  const [form, setForm] = useState<EnrollForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof EnrollForm | 'submit', string>>>({});
  const [step, setStep] = useState<StepKey>('student');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  // Lock body scroll so the page underneath doesn't keep growing as
  // the user scrolls. Was the source of the "infinite blank scroll"
  // complaint earlier.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Reset state every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setErrors({});
      setStep('student');
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const setField = (field: keyof EnrollForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
    if (errors.submit) setErrors(prev => ({ ...prev, submit: undefined }));
  };

  const blurValidate = (field: keyof EnrollForm) => {
    setErrors(prev => ({ ...prev, [field]: validateField(field, form[field], form) }));
  };

  const stepErrors = useMemo(() => {
    const next: Partial<Record<keyof EnrollForm, string>> = {};
    for (const field of FIELDS_FOR_STEP[step]) {
      const msg = validateField(field, form[field], form);
      if (msg) next[field] = msg;
    }
    return next;
  }, [form, step]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLastStep = stepIndex === STEP_ORDER.length - 1;
  const canAdvance = Object.keys(stepErrors).length === 0;

  const handleNext = () => {
    if (!canAdvance) {
      setErrors(prev => ({ ...prev, ...stepErrors }));
      return;
    }
    setStep(STEP_ORDER[stepIndex + 1]);
  };

  const handleBack = () => {
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolClassId) {
      setErrors({ submit: 'Please select a class before enrolling a student.' });
      return;
    }

    // Validate every field across both steps before sending.
    const allErrors: Partial<Record<keyof EnrollForm, string>> = {};
    for (const field of [...FIELDS_FOR_STEP.student, ...FIELDS_FOR_STEP.guardian]) {
      const msg = validateField(field, form[field], form);
      if (msg) allErrors[field] = msg;
    }
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // Jump back to the first step that has an error so the user sees it.
      const firstBadStep = STEP_ORDER.find(s =>
        FIELDS_FOR_STEP[s].some(f => allErrors[f]),
      );
      if (firstBadStep) setStep(firstBadStep);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      const created = await directoryApi.createStudent({
        name: form.name.trim(),
        dob: form.dob,
        whatsapp: form.whatsapp.trim(),
        // Optional student fields — only send when the admin filled them in.
        address: form.address.trim() || undefined,
        blood_group: form.blood_group.trim() || undefined,
        parent_name: form.parent_name.trim(),
        parent_email: form.parent_email.trim(),
        parent_phone: form.parent_phone.trim(),
        parent_secondary_phone: form.parent_secondary_phone.trim() || undefined,
        password: form.dob,
        school_class_id: selectedSchoolClassId,
      });
      toast.success(
        'Student enrolled',
        `${created?.name ?? form.name.trim()} added to the class.`,
      );
      onClose();
      onEnrolled();
    } catch (err) {
      const error = getErrorMessage(err);
      setErrors({
        submit: error.message
          || 'Could not enroll this student. Check the details and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const tree = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 modal-scrim cursor-default"
          />
          <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="modal-panel relative w-full max-w-xl my-4 sm:my-6 pointer-events-auto overflow-hidden"
            >

              {/* ── Header + stepper ─────────────────────────── */}
              <div className="flex items-start justify-between gap-3 px-6 sm:px-7 pt-6">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Enroll Student</h2>
                  <p className="text-text-secondary text-sm mt-0.5">Add a new student to the selected class.</p>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2.5 hover:bg-white/5 rounded-xl transition-all border border-glass-border shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 opacity-50 hover:opacity-100" />
                </button>
              </div>

              <Stepper current={stepIndex} total={STEP_ORDER.length} className="px-6 sm:px-7 mt-5" />

              {errors.submit && (
                <div className="mx-6 sm:mx-7 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{errors.submit}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="px-6 sm:px-7 pt-5 pb-6 space-y-5">
                {step === 'student' && (
                  <Section
                    icon={<UserPlus className="w-4 h-4" />}
                    label="Student details"
                  >
                    <Field
                      label="Full name"
                      required
                      error={errors.name}
                    >
                      <input
                        autoFocus
                        placeholder="e.g. Arjun Mehta"
                        maxLength={80}
                        className={cn('input-obsidian', errors.name && 'border-rose-500/50 bg-rose-500/[0.02]')}
                        value={form.name}
                        onChange={e => setField('name', e.target.value)}
                        onBlur={() => blurValidate('name')}
                      />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field
                        label="Date of birth"
                        required
                        error={errors.dob}
                      >
                        <input
                          type="date"
                          max={maxDobToday()}
                          className={cn('input-obsidian', errors.dob && 'border-rose-500/50 bg-rose-500/[0.02]')}
                          value={form.dob}
                          onChange={e => setField('dob', e.target.value)}
                          onBlur={() => blurValidate('dob')}
                        />
                      </Field>
                      <Field
                        label="WhatsApp"
                        required
                        error={errors.whatsapp}
                      >
                        <input
                          type="tel"
                          inputMode="tel"
                          placeholder="+91 98765 43210"
                          maxLength={20}
                          className={cn('input-obsidian', errors.whatsapp && 'border-rose-500/50 bg-rose-500/[0.02]')}
                          value={form.whatsapp}
                          onChange={e => setField('whatsapp', e.target.value)}
                          onBlur={() => blurValidate('whatsapp')}
                        />
                      </Field>
                    </div>
                    <Field label="Address" error={errors.address}>
                      <textarea
                        rows={2}
                        placeholder="Optional — residential address"
                        maxLength={250}
                        className="input-obsidian resize-none"
                        value={form.address}
                        onChange={e => setField('address', e.target.value)}
                      />
                    </Field>
                    <Field label="Blood group" error={errors.blood_group}>
                      <select
                        className="input-obsidian"
                        value={form.blood_group}
                        onChange={e => setField('blood_group', e.target.value)}
                      >
                        <option value="">Optional — select blood group</option>
                        {BLOOD_GROUPS.map(bg => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </Field>
                  </Section>
                )}

                {step === 'guardian' && (
                  <Section
                    icon={<User className="w-4 h-4" />}
                    label="Parent / guardian"
                  >
                    <Field
                      label="Guardian name"
                      required
                      error={errors.parent_name}
                    >
                      <input
                        autoFocus
                        placeholder="e.g. Suresh Mehta"
                        maxLength={80}
                        className={cn('input-obsidian', errors.parent_name && 'border-rose-500/50 bg-rose-500/[0.02]')}
                        value={form.parent_name}
                        onChange={e => setField('parent_name', e.target.value)}
                        onBlur={() => blurValidate('parent_name')}
                      />
                    </Field>
                    <Field
                      label="Email address"
                      required
                      error={errors.parent_email}
                    >
                      <input
                        type="email"
                        placeholder="suresh@gmail.com"
                        maxLength={120}
                        className={cn('input-obsidian', errors.parent_email && 'border-rose-500/50 bg-rose-500/[0.02]')}
                        value={form.parent_email}
                        onChange={e => setField('parent_email', e.target.value)}
                        onBlur={() => blurValidate('parent_email')}
                      />
                    </Field>
                    <Field
                      label="Phone number"
                      required
                      error={errors.parent_phone}
                      hint="Used as the parent's login credential."
                    >
                      <input
                        type="tel"
                        inputMode="tel"
                        placeholder="+91 98765 43210"
                        className={cn('input-obsidian', errors.parent_phone && 'border-rose-500/50 bg-rose-500/[0.02]')}
                        value={form.parent_phone}
                        onChange={e => setField('parent_phone', e.target.value)}
                        onBlur={() => blurValidate('parent_phone')}
                      />
                    </Field>
                    <Field
                      label="Secondary phone"
                      error={errors.parent_secondary_phone}
                      hint="Optional fallback / emergency contact number."
                    >
                      <input
                        type="tel"
                        inputMode="tel"
                        placeholder="+91 91234 56789"
                        className={cn('input-obsidian', errors.parent_secondary_phone && 'border-rose-500/50 bg-rose-500/[0.02]')}
                        value={form.parent_secondary_phone}
                        onChange={e => setField('parent_secondary_phone', e.target.value)}
                        onBlur={() => blurValidate('parent_secondary_phone')}
                      />
                    </Field>
                    <SummaryRow form={form} />
                  </Section>
                )}

                {/* ── Footer / actions ────────────────────────── */}
                <div className="pt-4 border-t border-glass-border flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[10px] text-text-secondary opacity-50">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Password auto-set to date of birth
                  </div>
                  <div className="flex items-center gap-2">
                    {stepIndex > 0 && (
                      <button
                        type="button"
                        onClick={handleBack}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-text-secondary hover:text-foreground border border-glass-border transition-colors disabled:opacity-40"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Back
                      </button>
                    )}
                    {!isLastStep ? (
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={!canAdvance}
                        className={cn(
                          'indigo-glow-button h-11 px-6 text-xs font-black uppercase tracking-widest inline-flex items-center gap-2',
                          !canAdvance && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        Continue <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={cn(
                          'indigo-glow-button h-11 px-6 text-xs font-black uppercase tracking-widest inline-flex items-center gap-2',
                          isSubmitting && 'opacity-50 cursor-wait',
                        )}
                      >
                        {isSubmitting ? (
                          <><Loader className="w-3.5 h-3.5 animate-spin" /> Enrolling…</>
                        ) : (
                          <>Enroll student <CheckCircle2 className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}

/* ── Local helpers ────────────────────────────────────────────────── */

function maxDobToday(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function Stepper({ current, total, className }: { current: number; total: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i <= current ? 'bg-brand-indigo flex-[2]' : 'bg-white/10 dark:bg-white/10 flex-1',
          )}
          aria-current={i === current ? 'step' : undefined}
        />
      ))}
      <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-2">
        Step {current + 1} / {total}
      </span>
    </div>
  );
}

function Section({
  icon, label, children,
}: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-brand-indigo">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.25em]">{label}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label, required, error, hint, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between items-center">
        <span>
          {label}
          {required && <span className="text-rose-400"> *</span>}
        </span>
        {error && (
          <span className="text-rose-400 normal-case tracking-normal font-medium italic">{error}</span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="text-[10px] text-text-secondary opacity-60 ml-1">{hint}</p>
      )}
    </div>
  );
}

function SummaryRow({ form }: { form: EnrollForm }) {
  if (!form.name && !form.dob) return null;
  return (
    <div className="mt-2 p-3 rounded-xl border border-glass-border bg-white/[0.02] text-[11px] text-text-secondary leading-relaxed">
      <p>
        Enrolling <span className="font-black text-foreground">{form.name || '—'}</span>
        {form.dob && <> · DOB <span className="font-mono">{form.dob}</span></>}
      </p>
    </div>
  );
}
