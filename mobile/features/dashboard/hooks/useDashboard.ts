import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  marksService,
  attendanceService,
  financeService,
  directoryService,
  announcementService,
  type Mark,
  type AttendanceRecord,
  type ParentFee,
  type StudentProfile,
  type Announcement,
} from '@/services';

export interface SubjectComparison {
  subject: string;
  studentPct: number;
  classAvgPct: number;
}

export function useDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fees, setFees] = useState<ParentFee[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [subjectComparisons, setSubjectComparisons] = useState<SubjectComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const studentId = user?.student_id || user?.id;

  const fetchAll = useCallback(async () => {
    if (!studentId) {
      console.warn('[Dashboard] No studentId available. user:', user);
      return;
    }

    // console.log('[Dashboard] Starting fetch. studentId:', studentId);
    setLoading(true);

    try {
      // 1. Fetch profile FIRST to get the correct student record ID and class info
      const profileResponse = await directoryService.getMyProfile();
      setProfile(profileResponse);
      const actualStudentId = profileResponse.id;
      const schoolClassId: number | undefined = profileResponse?.school_class?.id;

      // console.log('[Dashboard] Profile loaded, using studentId:', actualStudentId);

      // 2. Fetch other data using the verified student ID
      const [marksData, attendData, feesData, announcementData] = await Promise.allSettled([
        marksService.getMarks(actualStudentId),
        attendanceService.getAttendance(actualStudentId),
        financeService.getParentFees(),
        announcementService.getMyAnnouncements(),
      ]);

      if (marksData.status === 'fulfilled') {
        const fetchedMarks = marksData.value;
        setMarks(fetchedMarks);
        // console.log('[Dashboard] Marks loaded. Count:', fetchedMarks?.length);

        // 3. Build per-subject student stats, then fetch class averages in parallel
        if (schoolClassId && fetchedMarks.length > 0) {
          const subjectMap: Record<string, { total: number; maxTotal: number; maxScore: number }> = {};
          for (const m of fetchedMarks) {
            const key = m.subject_ref?.name || m.subject || 'General';
            if (!subjectMap[key]) subjectMap[key] = { total: 0, maxTotal: 0, maxScore: m.max_score };
            subjectMap[key].total    += m.score;
            subjectMap[key].maxTotal += m.max_score;
            subjectMap[key].maxScore  = m.max_score;
          }

          const subjects = Object.keys(subjectMap);
          const summaryResults = await Promise.allSettled(
            subjects.map(s => marksService.getSubjectSummary(s, schoolClassId)),
          );

          const comparisons: SubjectComparison[] = [];
          subjects.forEach((subject, i) => {
            const stats = subjectMap[subject];
            const studentPct = stats.maxTotal > 0
              ? Math.round((stats.total / stats.maxTotal) * 100)
              : 0;

            let classAvgPct = 0;
            const result = summaryResults[i];
            if (result.status === 'fulfilled' && result.value.count > 0 && stats.maxScore > 0) {
              classAvgPct = Math.round((result.value.average / stats.maxScore) * 100);
            }

            comparisons.push({ subject, studentPct, classAvgPct });
          });

          // Sort by studentPct descending
          comparisons.sort((a, b) => b.studentPct - a.studentPct);
          setSubjectComparisons(comparisons);
        }
      } else {
        console.error('[Dashboard] Marks fetch failed:', marksData.reason);
      }

      if (attendData.status === 'fulfilled') {
        setAttendance(attendData.value);
      } else {
        console.error('[Dashboard] Attendance fetch failed:', attendData.reason);
      }

      if (feesData.status === 'fulfilled') {
        setFees(feesData.value);
      } else {
        console.error('[Dashboard] Fees fetch failed:', feesData.reason);
      }

      if (announcementData.status === 'fulfilled') {
        setAnnouncements(announcementData.value || []);
      } else {
        console.error('[Dashboard] Announcements fetch failed:', announcementData.reason);
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
    announcements,
    subjectComparisons,
    loading,
    refreshing,
    onRefresh,
    studentId,
  };
}
