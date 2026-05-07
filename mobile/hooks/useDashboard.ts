import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  marksService,
  attendanceService,
  financeService,
  directoryService,
  type Mark,
  type AttendanceRecord,
  type ParentFee,
  type StudentProfile,
} from '../services';

export function useDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<ParentFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const studentId = user?.student_id || user?.id;

  const fetchAll = useCallback(async () => {
    if (!studentId) {
      console.warn('[Dashboard] No studentId available. user:', user);
      return;
    }

    console.log('[Dashboard] Starting fetch. studentId:', studentId);
    setLoading(true);

    try {
      // 1. Fetch profile FIRST to get the correct student record ID (e.g. 25 instead of 60)
      const profileResponse = await directoryService.getMyProfile();
      setProfile(profileResponse);
      const actualStudentId = profileResponse.id;
      
      console.log('[Dashboard] Profile loaded, using studentId:', actualStudentId);

      // 2. Fetch other data using the verified student ID
      const [marksData, attendData, feesData] = await Promise.allSettled([
        marksService.getMarks(actualStudentId),
        attendanceService.getAttendance(actualStudentId),
        financeService.getParentFees(),
      ]);

      console.log('[Dashboard] Fetch results:', {
        marks: marksData.status,
        attendance: attendData.status,
        fees: feesData.status,
      });

      // Profile was already set at line 37, we can just proceed with other results

      if (marksData.status === 'fulfilled') {
        setMarks(marksData.value);
        console.log('[Dashboard] Marks loaded. Count:', marksData.value?.length);
      } else {
        console.error('[Dashboard] Marks fetch failed:', marksData.reason);
      }

      if (attendData.status === 'fulfilled') {
        setAttendance(attendData.value);
        console.log('[Dashboard] Attendance loaded. Count:', attendData.value?.length);
      } else {
        console.error('[Dashboard] Attendance fetch failed:', attendData.reason);
      }

      if (feesData.status === 'fulfilled') {
        setFees(feesData.value);
        console.log('[Dashboard] Fees loaded. Count:', feesData.value?.length);
      } else {
        console.error('[Dashboard] Fees fetch failed:', feesData.reason);
      }
    } catch (e) {
      console.error('[Dashboard] Unexpected error during fetch:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId, user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  return {
    user,
    profile,
    marks,
    attendance,
    fees,
    loading,
    refreshing,
    onRefresh,
    studentId,
  };
}
