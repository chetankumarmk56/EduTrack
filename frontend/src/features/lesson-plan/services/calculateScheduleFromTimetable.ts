import type { Event, SchedulePeriod, TimetableSlot } from '@/shared/types';

export interface ClassSession {
  date: string;          // YYYY-MM-DD
  day_of_week: number;   // 0=Mon ... 6=Sun
  period_id: number;
  period_name: string;
  start_time: string;    // HH:MM:SS
  end_time: string;
  duration_hours: number;
}

export interface ExcludedDay {
  date: string;
  reason: string;        // e.g. "Diwali (non-teaching day)"
}

export interface TimetableScheduleResult {
  sessions: ClassSession[];
  totalSessions: number;
  totalHours: number;
  excludedDays: ExcludedDay[];
  sessionDates: string[]; // convenience: one entry per session (may repeat for multi-period days)
}

export interface CalculateOptions {
  startDate: string;
  endDate: string;
  schoolClassId: number;
  subjectId: number;
  slots: TimetableSlot[];   // teacher-scoped slots (from /timetable/me)
  periods: SchedulePeriod[];
  events: Event[];          // institution events; we filter for is_holiday
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** JS Date.getDay() is 0=Sun..6=Sat. Convert to our 0=Mon..6=Sun convention. */
function jsDayToMonZero(js: number): number {
  return js === 0 ? 6 : js - 1;
}

function timeStringToHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  return Math.max(0, (endMin - startMin) / 60);
}

/**
 * Build a date-keyed set of non-teaching days from event data. Only events
 * flagged is_holiday=true block class sessions. A multi-day event with
 * end_date extends the blackout window inclusively.
 */
function buildNonTeachingDayMap(events: Event[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) {
    if (!e.is_holiday) continue;
    const start = e.date;
    const end = e.end_date || e.date;
    if (!start) continue;
    let cursor = parseISODate(start);
    const last = parseISODate(end);
    if (isNaN(cursor.getTime()) || isNaN(last.getTime())) continue;
    while (cursor <= last) {
      out.set(toISO(cursor), e.title || 'Non-teaching day');
      cursor = addDays(cursor, 1);
    }
  }
  return out;
}

/**
 * Compute the real class sessions for a teacher for the given
 * (date range, class, subject) using the teacher's timetable as the
 * source of truth, excluding non-teaching days from admin events.
 *
 * A session is emitted per (date, period) — so a day with two periods
 * of the same subject produces two sessions.
 */
export function calculateScheduleFromTimetable({
  startDate,
  endDate,
  schoolClassId,
  subjectId,
  slots,
  periods,
  events,
}: CalculateOptions): TimetableScheduleResult {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { sessions: [], totalSessions: 0, totalHours: 0, excludedDays: [], sessionDates: [] };
  }
  if (end < start) {
    return { sessions: [], totalSessions: 0, totalHours: 0, excludedDays: [], sessionDates: [] };
  }

  // Filter to slots that match the chosen class+subject. The /timetable/me
  // endpoint already scopes slots to the logged-in teacher.
  const matchingSlots = slots.filter(
    (s) =>
      s.school_class_id === schoolClassId &&
      s.subject_id === subjectId,
  );

  if (matchingSlots.length === 0) {
    return { sessions: [], totalSessions: 0, totalHours: 0, excludedDays: [], sessionDates: [] };
  }

  const periodById = new Map(periods.map((p) => [p.id, p]));

  // Group matching slots by day_of_week so we know how many class periods
  // happen on a given weekday.
  const slotsByDay = new Map<number, TimetableSlot[]>();
  for (const slot of matchingSlots) {
    const arr = slotsByDay.get(slot.day_of_week) || [];
    arr.push(slot);
    slotsByDay.set(slot.day_of_week, arr);
  }

  const nonTeachingDays = buildNonTeachingDayMap(events);
  const sessions: ClassSession[] = [];
  const excludedDays: ExcludedDay[] = [];

  let cursor = start;
  while (cursor <= end) {
    const iso = toISO(cursor);
    const dow = jsDayToMonZero(cursor.getDay());
    const daySlots = slotsByDay.get(dow);

    if (daySlots && daySlots.length > 0) {
      const holidayTitle = nonTeachingDays.get(iso);
      if (holidayTitle) {
        excludedDays.push({ date: iso, reason: `${holidayTitle} — non-teaching day` });
      } else {
        // Sort by period.order so sessions appear in school-day order.
        const ordered = [...daySlots].sort((a, b) => {
          const pa = periodById.get(a.schedule_period_id);
          const pb = periodById.get(b.schedule_period_id);
          if (!pa || !pb) return 0;
          if (pa.order !== pb.order) return pa.order - pb.order;
          return pa.start_time.localeCompare(pb.start_time);
        });
        for (const slot of ordered) {
          const period = periodById.get(slot.schedule_period_id);
          if (!period) continue;
          sessions.push({
            date: iso,
            day_of_week: dow,
            period_id: period.id,
            period_name: period.name,
            start_time: period.start_time,
            end_time: period.end_time,
            duration_hours: timeStringToHours(period.start_time, period.end_time),
          });
        }
      }
    }

    cursor = addDays(cursor, 1);
  }

  const totalHours = sessions.reduce((sum, s) => sum + s.duration_hours, 0);
  return {
    sessions,
    totalSessions: sessions.length,
    totalHours,
    excludedDays,
    sessionDates: sessions.map((s) => s.date),
  };
}
