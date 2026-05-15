import { Ionicons } from '@expo/vector-icons';
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

/** Today's index in our 0=Mon convention. */
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

/** Ionicons name for a given period type. */
export function periodIconName(
  t: SchedulePeriodType,
): keyof typeof Ionicons.glyphMap {
  if (t === 'lunch') return 'restaurant-outline';
  if (t === 'break') return 'cafe-outline';
  if (t === 'assembly') return 'sparkles-outline';
  return 'book-outline';
}

/** Stable sort: by `order`, then by `start_time` as tiebreaker. */
export function sortPeriods(periods: SchedulePeriod[]): SchedulePeriod[] {
  return [...periods].sort((a, b) =>
    a.order !== b.order
      ? a.order - b.order
      : a.start_time.localeCompare(b.start_time),
  );
}

/** Build a O(1) lookup map of slots keyed by `<periodId>:<dayOfWeek>`. */
export function buildSlotMap(
  slots: TimetableSlot[],
): Map<string, TimetableSlot> {
  const map = new Map<string, TimetableSlot>();
  slots.forEach((s) => {
    map.set(`${s.schedule_period_id}:${s.day_of_week}`, s);
  });
  return map;
}
