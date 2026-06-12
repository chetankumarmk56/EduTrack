import { AttendanceRecord, Mark } from '@/shared/types';

// Local-calendar date string ("YYYY-MM-DD"). Never use
// `toISOString().split('T')[0]` for this — that returns the UTC date,
// which is still *yesterday* before 05:30 IST and once caused attendance
// to be recorded under the wrong day.
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a "YYYY-MM-DD" string as a local-time Date (avoids the UTC-midnight shift). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function computeGradeLabel(pct: number) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'D';
}

export function getAttendancePct(records: AttendanceRecord[]): number {
  if (records.length === 0) return 100;
  const present = records.filter(
    (r) => r.status === 'Present' || r.status === 'Late',
  ).length;
  return Math.round((present / records.length) * 100);
}

export function getSubjectPerformance(marks: Mark[]) {
  const map: Record<string, { total: number; max: number }> = {};
  for (const m of marks) {
    // Prefer subject_ref.name (new API), fall back to legacy subject field
    const key = m.subject_ref?.name || m.subject || 'General';
    if (!map[key]) map[key] = { total: 0, max: 0 };
    map[key].total += m.score;
    map[key].max += m.max_score;
  }
  return Object.entries(map).map(([subject, { total, max }]) => ({
    subject,
    pct: max > 0 ? Math.round((total / max) * 100) : 0,
  })).sort((a, b) => b.pct - a.pct);
}

export function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
