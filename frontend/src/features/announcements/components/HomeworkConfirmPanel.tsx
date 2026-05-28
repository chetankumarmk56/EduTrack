import { useState } from 'react';
import { BookOpenCheck, CheckCircle2, Loader2, User, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import { announcementApi, type Announcement, type HomeworkChildStatus } from '../api';

/**
 * Parent-facing homework completion panel.
 *
 * Renders one button per *targeted* child so a parent with multiple kids
 * in the same class can confirm each independently. After the first
 * confirmation the row collapses to a "Completed by … on …" affordance
 * and the button is disabled to prevent duplicate confirmations.
 */
export function HomeworkConfirmPanel({
  announcement,
  onConfirmed,
}: {
  announcement: Announcement;
  /** Called after each successful confirmation so the parent page can refresh. */
  onConfirmed?: (updated: HomeworkChildStatus) => void;
}) {
  const [localState, setLocalState] = useState<Record<number, HomeworkChildStatus>>(
    Object.fromEntries(
      (announcement.homework_my_children ?? []).map((c) => [c.student_id, c]),
    ),
  );
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const children = announcement.homework_my_children ?? [];
  if (children.length === 0) {
    // Either this isn't a homework, or the viewer isn't a parent of any
    // targeted child. Nothing to render.
    return null;
  }

  const confirmed = Object.values(localState).filter((c) => c.confirmed).length;

  const handleConfirm = async (studentId: number) => {
    setError(null);
    setPending(studentId);
    try {
      const row = await announcementApi.confirmHomework(announcement.id, studentId);
      const next: HomeworkChildStatus = {
        student_id: row.student_id,
        student_name: localState[studentId]?.student_name,
        confirmed: true,
        confirmed_at: row.confirmed_at,
        confirmed_by_parent_id: row.parent_id ?? null,
      };
      setLocalState((s) => ({ ...s, [studentId]: next }));
      onConfirmed?.(next);
    } catch (e) {
      setError(getErrorMessage(e).message || 'Could not confirm. Please try again.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-50/60 p-5 space-y-4">
      <div className="flex items-center gap-2 text-amber-700">
        <BookOpenCheck className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase tracking-widest">
          Homework
        </span>
        {announcement.due_date && (
          <span className="ml-2 inline-flex items-center gap-1 text-amber-600 text-[10px] font-bold uppercase tracking-widest">
            <Calendar className="w-3 h-3" />
            Due {formatDue(announcement.due_date)}
          </span>
        )}
        <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-500">
          {confirmed}/{children.length} confirmed
        </span>
      </div>

      {(announcement.subject || announcement.instructions) && (
        <div className="text-sm text-slate-600 space-y-1">
          {announcement.subject && (
            <p className="font-bold text-slate-800">{announcement.subject}</p>
          )}
          {announcement.instructions && (
            <p className="whitespace-pre-wrap leading-relaxed">{announcement.instructions}</p>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {children.map((c) => {
          const state = localState[c.student_id] ?? c;
          const isPending = pending === c.student_id;
          return (
            <li
              key={c.student_id}
              className={cn(
                'flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-white',
                state.confirmed ? 'border-emerald-300' : 'border-slate-200',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                    state.confirmed
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-amber-100 text-amber-600',
                  )}
                >
                  {state.confirmed ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {state.student_name ?? `Student #${c.student_id}`}
                  </p>
                  {state.confirmed && state.confirmed_at && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Completed {formatDateShort(state.confirmed_at)}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={state.confirmed || isPending}
                onClick={() => handleConfirm(c.student_id)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all',
                  state.confirmed
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 cursor-default'
                    : 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600',
                  isPending && 'opacity-70 cursor-progress',
                )}
              >
                {state.confirmed ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                  </>
                ) : isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving
                  </>
                ) : (
                  'Mark as completed'
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="flex items-center gap-2 text-xs font-bold text-rose-600">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
    </div>
  );
}

function formatDue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
