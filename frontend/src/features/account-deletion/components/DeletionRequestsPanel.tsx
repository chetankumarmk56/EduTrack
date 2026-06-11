import { useCallback, useEffect, useState } from 'react';
import { Check, X, RefreshCw, Inbox } from 'lucide-react';
import { accountDeletionApi, type AccountDeletionRequest } from '../api';

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent',
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Administrator',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    APPROVED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    REJECTED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${styles[status] || styles.CANCELLED}`}>
      {label}
    </span>
  );
}

/**
 * Reviewer panel shared by the admin and super-admin portals. The list endpoint
 * is scoped server-side by the caller's role, so the same component serves both:
 * admins see parent/student/teacher requests in their school; super-admins see
 * admin requests. Approving deactivates the target account immediately.
 */
export default function DeletionRequestsPanel() {
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await accountDeletionApi.listRequests(filter));
    } catch {
      /* error toast handled by the axios client */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: number, kind: 'approve' | 'reject') => {
    if (
      kind === 'approve' &&
      !window.confirm('Approve this deletion request? The account will be deactivated immediately.')
    ) {
      return;
    }
    setBusyId(id);
    try {
      if (kind === 'approve') await accountDeletionApi.approve(id);
      else await accountDeletionApi.reject(id);
      await load();
    } catch {
      /* handled by client */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          {(['PENDING', 'ALL'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                filter === f
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {f === 'PENDING' ? 'Pending' : 'All'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
          <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            No {filter === 'PENDING' ? 'pending ' : ''}deletion requests.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold text-slate-900 dark:text-slate-100">
                      {r.requester_name || `User #${r.user_id}`}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {ROLE_LABEL[r.requester_role] || r.requester_role}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.requester_email && (
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{r.requester_email}</p>
                  )}
                  {r.reason && (
                    <p className="mt-2 text-sm italic text-slate-600 dark:text-slate-300">“{r.reason}”</p>
                  )}
                  <p className="mt-2 text-[11px] text-slate-400">
                    Requested {fmtDate(r.created_at)}
                    {r.reviewed_at
                      ? ` · Reviewed ${fmtDate(r.reviewed_at)}${r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ''}`
                      : ''}
                  </p>
                </div>

                {r.status === 'PENDING' && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => act(r.id, 'approve')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> Approve
                    </button>
                    <button
                      onClick={() => act(r.id, 'reject')}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      <X className="h-4 w-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
