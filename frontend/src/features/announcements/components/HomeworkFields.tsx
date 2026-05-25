import { BookOpenCheck, Calendar, FileText, Hash } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { AnnouncementCreate } from '../api';

/**
 * Form section used by the teacher portal. Renders only when the parent
 * form has marked the announcement as homework, so all homework-specific
 * inputs (due date, subject, instructions) live in one isolated module
 * instead of being scattered through TeacherAnnouncements.tsx.
 *
 * `form` and `onChange` are passed in directly so this component stays
 * a controlled presentation piece — the parent owns the state and submit.
 */
export function HomeworkFields({
  form,
  onChange,
}: {
  form: AnnouncementCreate;
  onChange: (patch: Partial<AnnouncementCreate>) => void;
}) {
  // Convert the form's ISO datetime (or undefined) to the value an
  // <input type="datetime-local"> expects, preserving local time.
  const dueDateInput = form.due_date ? toLocalInput(form.due_date) : '';

  return (
    <div
      className={cn(
        'space-y-4 p-5 rounded-2xl border bg-amber-500/[0.05] border-amber-500/30',
      )}
    >
      <div className="flex items-center gap-2 text-amber-500 text-[10px] font-black uppercase tracking-widest">
        <BookOpenCheck className="w-4 h-4" />
        Homework details
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" /> Due Date *
        </label>
        <input
          type="datetime-local"
          className="input-obsidian h-12 w-full [color-scheme:dark]"
          value={dueDateInput}
          onChange={(e) =>
            onChange({
              due_date: e.target.value ? fromLocalInput(e.target.value) : null,
            })
          }
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
          <Hash className="w-3.5 h-3.5" /> Subject
        </label>
        <input
          type="text"
          maxLength={120}
          placeholder="e.g. Mathematics — Algebra"
          className="input-obsidian h-12"
          value={form.subject ?? ''}
          onChange={(e) => onChange({ subject: e.target.value || null })}
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" /> Instructions (optional)
        </label>
        <textarea
          maxLength={5000}
          rows={3}
          placeholder="Steps the student should follow, resources to refer to..."
          className="input-obsidian min-h-[90px] py-3 leading-relaxed resize-none"
          value={form.instructions ?? ''}
          onChange={(e) => onChange({ instructions: e.target.value || null })}
        />
      </div>
    </div>
  );
}

// `datetime-local` inputs are timezone-naive. Round-tripping through
// toISOString would shift the day for non-UTC zones (see auto-memory
// `feedback_date_formatting`). These helpers preserve the local clock.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fromLocalInput(local: string): string {
  // The Date constructor interprets a `YYYY-MM-DDTHH:mm` string as local
  // time, which is exactly what we want. Then we serialise to ISO so the
  // backend stores a TZ-aware UTC timestamp.
  return new Date(local).toISOString();
}
