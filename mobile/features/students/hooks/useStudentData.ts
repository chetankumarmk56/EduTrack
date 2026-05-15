import { useState, useCallback, useEffect } from 'react';
import {
  marksService,
  attendanceService,
  directoryService,
  financeService,
  type Mark,
  type AttendanceRecord,
  type StudentProfile,
  type ParentFee,
} from '@/services';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface StudentData {
  profile: StudentProfile | null;
  marks: Mark[];
  attendance: AttendanceRecord[];
  fees: ParentFee[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Centralised hook that fetches all data needed for a student/parent session.
 * Results are fetched in parallel with Promise.allSettled so a single failure
 * doesn't block the rest of the dashboard from rendering.
 */
export function useStudentData(): StudentData {
  const { user } = useAuth();
  const studentId: number | null = user?.student_id ?? user?.id ?? null;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<ParentFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [profileRes, marksRes, attendRes, feesRes] = await Promise.allSettled([
      directoryService.getStudentProfile(studentId),
      marksService.getMarks(studentId),
      attendanceService.getAttendance(studentId),
      financeService.getParentFees(),
    ]);

    if (profileRes.status === 'fulfilled') setProfile(profileRes.value);
    if (marksRes.status === 'fulfilled') setMarks(marksRes.value);
    if (attendRes.status === 'fulfilled') setAttendance(attendRes.value);
    if (feesRes.status === 'fulfilled') setFees(feesRes.value);

    // Surface the first error if all calls failed
    const firstError = [profileRes, marksRes, attendRes, feesRes].find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult | undefined;
    if (firstError && profileRes.status === 'rejected') {
      setError((firstError.reason as Error).message ?? 'Failed to load data');
    }

    setLoading(false);
  }, [studentId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { profile, marks, attendance, fees, loading, error, refresh: fetchAll };
}
