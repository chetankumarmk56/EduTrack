import {
  computeGradeLabel,
  getAttendancePct,
  getSubjectPerformance,
} from './formatters';
import type { AttendanceRecord, Mark } from '@/shared/types';

describe('computeGradeLabel', () => {
  it.each([
    [95, 'A+'],
    [85, 'A'],
    [72, 'B+'],
    [61, 'B'],
    [50, 'C'],
    [10, 'D'],
  ])('maps %d%% -> %s', (pct, label) => {
    expect(computeGradeLabel(pct)).toBe(label);
  });
});

describe('getAttendancePct', () => {
  it('returns 100 for an empty record set (no penalty before any data)', () => {
    expect(getAttendancePct([])).toBe(100);
  });

  it('counts Present and Late as attended', () => {
    const rec = (status: AttendanceRecord['status']): AttendanceRecord =>
      ({ status } as AttendanceRecord);
    const records = [rec('Present'), rec('Late'), rec('Absent'), rec('Absent')];
    expect(getAttendancePct(records)).toBe(50);
  });
});

describe('getSubjectPerformance', () => {
  it('aggregates marks per subject and sorts by percentage desc', () => {
    const m = (subject: string, score: number, max_score: number): Mark =>
      ({ subject, score, max_score } as Mark);
    const out = getSubjectPerformance([
      m('Math', 8, 10),   // 80% (combined below)
      m('Math', 9, 10),   // Math total 17/20 = 85%
      m('Science', 5, 10), // 50%
    ]);
    expect(out[0]).toEqual({ subject: 'Math', pct: 85 });
    expect(out[1]).toEqual({ subject: 'Science', pct: 50 });
  });

  it('guards against divide-by-zero when max is 0', () => {
    const out = getSubjectPerformance([{ subject: 'X', score: 0, max_score: 0 } as Mark]);
    expect(out[0].pct).toBe(0);
  });
});
