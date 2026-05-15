import { Coffee, Utensils, Sparkles, BookOpen } from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import type {
  SchedulePeriod,
  SchedulePeriodType,
  TimetableSlot,
} from '@/shared/types';

/** Mon..Sun shorthand labels — index 0 = Monday. */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Mon..Sun full names — index 0 = Monday. */
export const DAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Today's index in our 0=Mon convention.
 * JS `Date.getDay()` uses 0=Sun, so we shift it.
 */
export function todayIndex(): number {
  const js = new Date().getDay();
  return js === 0 ? 6 : js - 1;
}

/** Strip seconds from a "HH:MM:SS" backend time string for display. */
export function formatTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h}:${m}`;
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function timeToMinutes(t?: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight for "now" — used for current-period highlighting. */
export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Lucide icon component for a given period type. */
export function periodIconFor(
  t: SchedulePeriodType,
): ComponentType<LucideProps> {
  if (t === 'lunch') return Utensils;
  if (t === 'break') return Coffee;
  if (t === 'assembly') return Sparkles;
  return BookOpen;
}

/** Stable sort: by `order`, then by `start_time` as tiebreaker. */
export function sortPeriods(periods: SchedulePeriod[]): SchedulePeriod[] {
  return [...periods].sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : a.start_time.localeCompare(b.start_time),
  );
}

/**
 * Build a O(1) lookup map of slots keyed by `<periodId>:<dayOfWeek>`.
 * Use `slotMap.get(`${periodId}:${day}`)` to find the slot for a cell.
 */
export function buildSlotMap(slots: TimetableSlot[]): Map<string, TimetableSlot> {
  const map = new Map<string, TimetableSlot>();
  slots.forEach((s) => {
    map.set(`${s.schedule_period_id}:${s.day_of_week}`, s);
  });
  return map;
}
