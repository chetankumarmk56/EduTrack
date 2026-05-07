import { AttendanceRecord, Mark } from '../types';

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
