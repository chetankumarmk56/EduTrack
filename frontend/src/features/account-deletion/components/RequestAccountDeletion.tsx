import { useEffect, useState } from 'react';
import { ShieldAlert, Trash2, Clock, X } from 'lucide-react';
import { accountDeletionApi, type AccountDeletionRequest } from '../api';

/**
 * Self-service "delete my account" card for the web profile pages (parent,
 * teacher, admin). Creating a request notifies the appropriate approver
 * (admin for parent/student/teacher; super-admin for admin). Theme-safe
 * concrete colours (slate/red/amber with dark: variants) so it renders on
 * every portal theme.
 */
export default function RequestAccountDeletion() {
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let active = true;
    accountDeletionApi
      .getMyRequest()
      .then((r) => active && setRequest(r))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const pending = request?.status === 'PENDING';

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await accountDeletionApi.createRequest(reason.trim() || undefined);
      setRequest(res.request);
      setShowForm(false);
      setReason('');
    } catch {
      /* error toast handled by the axios client */
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setSubmitting(true);
    try {
      const res = await accountDeletionApi.cancelMyRequest();
      setRequest(res.request);
    } catch {
      /* handled by client */
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900/40 dark:bg-red-950/20 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete your account</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Request deletion of your account and associated personal data. Your school administrator
            reviews and approves the request; once approved, your access is removed. This cannot be
            undone.
          </p>

          {pending ? (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <Clock className="h-4 w-4" /> Deletion requested — pending review
              </span>
              <button
                onClick={cancel}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-white/60 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" /> Cancel request
              </button>
            </div>
          ) : showForm ? (
            <div className="mt-4 space-y-3">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason (optional)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Submit deletion request'}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setReason('');
                  }}
                  disabled={submitting}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white/60 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" /> Request account deletion
            </button>
          )}

          {request && request.status === 'REJECTED' && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              A previous request was declined{request.review_note ? `: ${request.review_note}` : '.'} You
              can submit a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
