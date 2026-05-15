import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi } from '@/features/auth/api';
import { validateNewPassword, PASSWORD_MIN_LENGTH } from '@/shared/lib/passwordRules';
import { extractApiError } from '@/shared/lib/apiError';
import PasswordField from './PasswordField';

type Status = { type: 'idle' } | { type: 'error'; message: string } | { type: 'success' };

const initialFormState = { current: '', next: '', confirm: '' };

export default function ChangePasswordCard() {
  const [form, setForm] = useState(initialFormState);
  const [showNext, setShowNext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.current || !form.next || !form.confirm) return 'All fields are required.';
    if (form.next !== form.confirm) return 'New password and confirmation do not match.';
    const ruleError = validateNewPassword(form.next);
    if (ruleError) return ruleError;
    if (form.next === form.current) return 'New password must be different from the current password.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'idle' });
    const err = validate();
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await authApi.changePassword(form.current, form.next);
      setForm(initialFormState);
      setShowNext(false);
      setStatus({ type: 'success' });
    } catch (caught) {
      setStatus({ type: 'error', message: extractApiError(caught, 'Could not update password. Please try again.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Change Password</h3>
          <p className="text-xs text-muted-foreground">
            Use at least {PASSWORD_MIN_LENGTH} characters with letters and numbers.
          </p>
        </div>
      </div>

      <PasswordField
        id="cp-current"
        label="Current Password"
        value={form.current}
        onChange={(v) => update('current', v)}
        autoComplete="current-password"
        disabled={submitting}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <PasswordField
            id="cp-new"
            label="New Password"
            value={form.next}
            onChange={(v) => update('next', v)}
            autoComplete="new-password"
            disabled={submitting}
            forceShow={showNext}
            hideToggle
          />
          <button
            type="button"
            onClick={() => setShowNext((s) => !s)}
            className="text-xs text-muted-foreground hover:text-primary mt-2"
          >
            {showNext ? 'Hide new password' : 'Show new password'}
          </button>
        </div>
        <PasswordField
          id="cp-confirm"
          label="Confirm New Password"
          value={form.confirm}
          onChange={(v) => update('confirm', v)}
          autoComplete="new-password"
          disabled={submitting}
          forceShow={showNext}
          hideToggle
        />
      </div>

      <AnimatePresence>
        {fieldError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{fieldError}</span>
          </motion.div>
        )}
        {status.type === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{status.message}</span>
          </motion.div>
        )}
        {status.type === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Password updated successfully.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 transition"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {submitting ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </form>
  );
}
