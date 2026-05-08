const WEEKDAY_PATTERNS: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

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

export interface ScheduleResult {
  sessionDates: string[];
  totalSessions: number;
  totalHours: number;
}

/**
 * Walks every calendar day from start to end and emits a session date for
 * each day whose weekday is in the pattern for the given classesPerWeek.
 * Pure: same inputs always yield same output.
 */
export function calculateSchedule(
  startDate: string,
  endDate: string,
  classesPerWeek: number,
  hoursPerClass: number
): ScheduleResult {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }
  if (end < start) {
    throw new Error('End date must be on or after start date.');
  }

  const cpw = Math.max(1, Math.min(7, Math.floor(classesPerWeek)));
  const pattern = new Set(WEEKDAY_PATTERNS[cpw]);

  const sessionDates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (pattern.has(cursor.getDay())) {
      sessionDates.push(toISO(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  const totalSessions = sessionDates.length;
  const totalHours = totalSessions * hoursPerClass;

  return { sessionDates, totalSessions, totalHours };
}
