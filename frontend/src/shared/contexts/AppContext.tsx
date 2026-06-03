import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { directoryApi } from '@/features/directory/api';
import { marksApi } from '@/features/marks/api';
import { attendanceApi } from '@/features/attendance/api';
import { eventsApi } from '@/features/events/api';
import { financeApi } from '@/features/finance/api';
import { useAuth } from './AuthContext';
import type {
  Student,
  Teacher,
  Grade,
  Section,
  Subject,
  SchoolClass,
  Mark,
  Attendance,
  Event,
  TeacherStats,
  SubjectSummary,
  ParentFeeItem,
  AiAnalysisResult,
} from '@/shared/types';

interface AppContextType {
  // Directory
  students: Student[];
  classDirectory: Student[];
  teachers: Teacher[];
  teacherDirectory: Teacher[];
  grades: Grade[];
  sections: Section[];
  subjects: Subject[];
  schoolClasses: SchoolClass[];
  refreshDirectory: (force?: boolean) => Promise<void>;
  refreshStudents: (filters?: {
    schoolClassId?: number | null;
    search?: string;
    isActive?: boolean;
  }) => Promise<void>;
  refreshTeachers: (filters?: { search?: string; isActive?: boolean }) => Promise<void>;

  // Loading states
  isDirectoryLoading: boolean;
  isAcademicLoading: boolean;
  isEventsLoading: boolean;

  // Student portal
  studentProfile: Student | null;
  studentMarks: Mark[];
  studentAttendance: Attendance[];
  events: Event[];
  fetchStudentData: (studentId: number) => Promise<void>;

  // Teacher portal
  classMarks: Record<string, Mark[]>;
  fetchClassMarks: (subject: string, schoolClassId?: number, examId?: number) => Promise<Mark[]>;
  fetchSubjectSummary: (subject: string, schoolClassId: number) => Promise<SubjectSummary | null>;
  subjectSummaries: Record<string, SubjectSummary>;
  aiAnalysis: AiAnalysisResult | null;
  setAiAnalysis: (analysis: AiAnalysisResult | null) => void;
  teacherStats: TeacherStats | null;
  fetchTeacherStats: () => Promise<void>;
  teacherSubject: string;

  // Institution
  institutionId: number;
  setInstitutionId: (id: number) => void;
  institutionName: string;
  setInstitutionName: (name: string) => void;
  // Resolved URL to the school's logo, or null when no logo has been
  // uploaded. Persisted to localStorage so returning users see their
  // school's brand immediately on the login page.
  institutionLogoUrl: string | null;
  setInstitutionLogoUrl: (url: string | null) => void;
  activeAssignmentId: number | null;
  setActiveAssignmentId: (id: number | null) => void;

  // Parent fees
  parentFees: ParentFeeItem[];
  refreshParentFees: () => Promise<void>;
  getParentFees: () => Promise<ParentFeeItem[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { authState, user } = useAuth();

  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem('edu_cache_students');
    return saved ? JSON.parse(saved) : [];
  });
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('edu_cache_teachers');
    return saved ? JSON.parse(saved) : [];
  });
  const [grades, setGrades] = useState<Grade[]>(() => {
    const saved = localStorage.getItem('edu_cache_grades');
    return saved ? JSON.parse(saved) : [];
  });
  const [sections, setSections] = useState<Section[]>(() => {
    const saved = localStorage.getItem('edu_cache_sections');
    return saved ? JSON.parse(saved) : [];
  });
  const [subjects, setSubjects] = useState<Subject[]>(() => {
    const saved = localStorage.getItem('edu_cache_subjects');
    return saved ? JSON.parse(saved) : [];
  });
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>(() => {
    const saved = localStorage.getItem('edu_cache_school_classes');
    return saved ? JSON.parse(saved) : [];
  });
  const [events, setEvents] = useState<Event[]>(() => {
    const saved = localStorage.getItem('edu_cache_events');
    return saved ? JSON.parse(saved) : [];
  });
const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
  const [isAcademicLoading, setIsAcademicLoading] = useState(false);
  const [isEventsLoading, setIsEventsLoading] = useState(false);

  const [classMarks, setClassMarks] = useState<Record<string, Mark[]>>({});

  const [studentProfile, setStudentProfile] = useState<Student | null>(() => {
    const saved = localStorage.getItem('edu_cache_student_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [studentMarks, setStudentMarks] = useState<Mark[]>(() => {
    const saved = localStorage.getItem('edu_cache_student_marks');
    return saved ? JSON.parse(saved) : [];
  });
  const [studentAttendance, setStudentAttendance] = useState<Attendance[]>(() => {
    const saved = localStorage.getItem('edu_cache_student_attendance');
    return saved ? JSON.parse(saved) : [];
  });

  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResult | null>(null);
  const [teacherStats, setTeacherStats] = useState<TeacherStats | null>(null);
  const [subjectSummaries, setSubjectSummaries] = useState<Record<string, SubjectSummary>>({});

  const fetchTeacherStats = async () => {
    try {
      const { statisticsApi } = await import('@/shared/api/statisticsApi');
      const data = await statisticsApi.getTeacherStats();
      setTeacherStats(data);
    } catch (err) {
      console.error("Error fetching teacher stats:", err);
    }
  };

  const [institutionId, setInstitutionId] = useState<number>(() => {
    const saved = localStorage.getItem('edu_institution_id');
    return saved ? Number(saved) : 1;
  });
  const [institutionName, setInstitutionName] = useState<string>(() => {
    return localStorage.getItem('edu_institution_name') || 'Arken Edu Academy';
  });
  const [institutionLogoUrl, setInstitutionLogoUrl] = useState<string | null>(() => {
    return localStorage.getItem('edu_institution_logo_url') || null;
  });

  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('edu_active_assignment_id');
    return saved ? Number(saved) : null;
  });

  const [parentFees, setParentFees] = useState<ParentFeeItem[]>([]);

  useEffect(() => {
    if (activeAssignmentId) {
      localStorage.setItem('edu_active_assignment_id', String(activeAssignmentId));
    } else {
      localStorage.removeItem('edu_active_assignment_id');
    }
  }, [activeAssignmentId]);

  // Persist institutionName so the value the login flow set (the real
  // school name returned by the server) survives a hard reload. Without
  // this, the dashboard would briefly flash "Institution <id>" on first
  // login and revert to the placeholder default on refresh.
  useEffect(() => {
    if (institutionName) {
      localStorage.setItem('edu_institution_name', institutionName);
    }
  }, [institutionName]);

  // Same idea for the logo: persist whatever the latest login/initialize
  // returned so the sidebar (and the returning-user login page) can show
  // the school's brand without a flash of the generic fallback.
  useEffect(() => {
    if (institutionLogoUrl) {
      localStorage.setItem('edu_institution_logo_url', institutionLogoUrl);
    } else {
      localStorage.removeItem('edu_institution_logo_url');
    }
  }, [institutionLogoUrl]);

  const refreshEvents = useCallback(async () => {
    setIsEventsLoading(true);
    try {
      const eventsData: Event[] = await eventsApi.getEvents();
      setEvents(eventsData);
      localStorage.setItem('edu_cache_events', JSON.stringify(eventsData));
    } catch (err) {
      console.error("Events Fetch Error:", err);
    } finally {
      setIsEventsLoading(false);
    }
  }, []);

  const refreshDirectory = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    const cachedFetch = Number(localStorage.getItem('edu_cache_last_fetch') || '0');
    const hasCachedStudents = Boolean(localStorage.getItem('edu_cache_students'));
    if (!force && cachedFetch && (now - cachedFetch < 300000) && hasCachedStudents) {
      const cachedEvents = localStorage.getItem('edu_cache_events');
      if (!cachedEvents || cachedEvents === '[]') refreshEvents();
      return;
    }

    const cachedStudentsRaw = localStorage.getItem('edu_cache_students');
    const isInitialLoad = !cachedStudentsRaw || cachedStudentsRaw === '[]';
    if (isInitialLoad) {
      setIsDirectoryLoading(true);
      setIsAcademicLoading(true);
    }

    try {
      const { systemApi } = await import('@/shared/api/systemApi');
      const data = await systemApi.getInitialize();

      localStorage.setItem('edu_cache_last_fetch', String(now));

      if (data.institution_name) {
        // Update both storage and React state so the sidebar/dashboard
        // refreshes immediately on first login — the previous version
        // wrote to localStorage but never to state, which meant the UI
        // kept showing the stale value (often "Institution 1") until a
        // hard reload.
        localStorage.setItem('edu_institution_name', data.institution_name);
        setInstitutionName(data.institution_name);
      }

      // institution_logo_url is null when no logo has been uploaded — we
      // explicitly clear in that case so an old school's cached URL never
      // leaks into a different account after a logout/login on the same
      // browser.
      setInstitutionLogoUrl(data.institution_logo_url ?? null);

      if (data.academic) {
        setGrades(data.academic.grades || []);
        setSections(data.academic.sections || []);
        setSubjects(data.academic.subjects || []);
        setSchoolClasses(data.academic.school_classes || []);
        localStorage.setItem('edu_cache_grades', JSON.stringify(data.academic.grades || []));
        localStorage.setItem('edu_cache_sections', JSON.stringify(data.academic.sections || []));
        localStorage.setItem('edu_cache_subjects', JSON.stringify(data.academic.subjects || []));
        localStorage.setItem('edu_cache_school_classes', JSON.stringify(data.academic.school_classes || []));
      }

      // Bulk directory hydration. We only persist these in localStorage
      // when the caller is an admin/teacher who actually uses the list —
      // parents/students see their own marks/attendance, not the whole
      // institution. Persisting a stale 5K-student blob in parent
      // localStorage was load-bearing for nothing and slowed up every
      // refresh.
      const isStaffRole =
        user?.role === 'admin' ||
        user?.role === 'super_admin' ||
        user?.role === 'teacher';

      if (data.directory) {
        const s: Student[] = data.directory.students || [];
        const t: Teacher[] = data.directory.teachers || [];
        setStudents(s);
        setTeachers(t);
        if (isStaffRole) {
          localStorage.setItem('edu_cache_students', JSON.stringify(s));
          localStorage.setItem('edu_cache_teachers', JSON.stringify(t));
        }
      } else if (data.students) {
        setStudents(data.students);
        if (isStaffRole) {
          localStorage.setItem('edu_cache_students', JSON.stringify(data.students));
        }
      }

      if (data.teacher_details) {
        const t_info: Teacher = data.teacher_details;
        setTeachers(prev => {
          const newList = prev.some(t => t.id === t_info.id)
            ? prev.map(t => t.id === t_info.id ? t_info : t)
            : [...prev, t_info];
          localStorage.setItem('edu_cache_teachers', JSON.stringify(newList));
          return newList;
        });
      }

      if (data.stats) {
        setTeacherStats(data.stats);
      }

      await refreshEvents();

    } catch (err) {
      console.error("System Initialization Failed:", err);
    } finally {
      setIsDirectoryLoading(false);
      setIsAcademicLoading(false);
    }
  }, [refreshEvents]);

  const refreshStudents = useCallback(async (
    filters: { schoolClassId?: number | null; search?: string; isActive?: boolean } = {},
  ) => {
    setIsDirectoryLoading(true);
    try {
      // Push filters down to SQL — see directoryApi.getStudents and
      // backend students.read_students. Without filters the backend
      // returns the first 100 rows (paged); admin pages should always
      // pass `schoolClassId` so we only fetch one class.
      const data = await directoryApi.getStudents(filters);
      setStudents(data);
    } catch (err) {
      console.error("Failed to load students:", err);
    } finally {
      setIsDirectoryLoading(false);
    }
  }, []);

  const refreshTeachers = useCallback(async (
    filters: { search?: string; isActive?: boolean } = {},
  ) => {
    setIsDirectoryLoading(true);
    try {
      const data = await directoryApi.getTeachers(filters);
      setTeachers(data);
    } catch (err) {
      console.error("Failed to load teachers:", err);
    } finally {
      setIsDirectoryLoading(false);
    }
  }, []);

  const refreshParentFees = useCallback(async () => {
    try {
      const data: ParentFeeItem[] = await financeApi.getParentFees();
      setParentFees(data);
    } catch (err) {
      console.error("Parent Fees Fetch Error:", err);
    }
  }, []);

  const [currentlyFetchingMarks, setCurrentlyFetchingMarks] = useState<string | null>(null);

  const fetchClassMarks = async (subject: string, schoolClassId?: number, examId?: number): Promise<Mark[]> => {
    const cacheKey = `${subject}_${schoolClassId || 'all'}_${examId || 'all'}`;

    if (classMarks[cacheKey]) {
      marksApi.getClassMarks(subject, schoolClassId, examId).then((data: Mark[]) => {
        setClassMarks(prev => ({ ...prev, [cacheKey]: data }));
      });
      return classMarks[cacheKey];
    }

    if (currentlyFetchingMarks === cacheKey) return [];

    setCurrentlyFetchingMarks(cacheKey);
    try {
      const data: Mark[] = await marksApi.getClassMarks(subject, schoolClassId, examId);
      setClassMarks(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch (err) {
      console.error("Error fetching class marks:", err);
      return [];
    } finally {
      setCurrentlyFetchingMarks(null);
    }
  };

  const fetchSubjectSummary = async (subject: string, schoolClassId: number): Promise<SubjectSummary | null> => {
    const key = `${subject}_${schoolClassId}`;
    if (subjectSummaries[key]) return subjectSummaries[key];

    try {
      const data: SubjectSummary = await marksApi.getSubjectSummary(subject, schoolClassId);
      setSubjectSummaries(prev => ({ ...prev, [key]: data }));
      return data;
    } catch (err) {
      console.error("Error fetching subject summary:", err);
      return null;
    }
  };

  const teacherSubject = useMemo(() => {
    if (user?.role !== 'teacher') return 'General';
    const teacher = teachers.find(t => t.user_id === user.id);
    return teacher?.assignments?.[0]?.subject_ref?.name || 'Subject Teacher';
  }, [teachers, user]);

  useEffect(() => {
    if (authState === 'authenticated') {
      refreshDirectory();

      if (user?.role === 'student' || user?.role === 'parent') {
        directoryApi.getMyProfile().then((profile: Student) => {
          setStudentProfile(profile);
          localStorage.setItem('edu_cache_student_profile', JSON.stringify(profile));
          fetchStudentData(profile.id);
        }).catch(() => {
          if (user?.id) fetchStudentData(user.id);
        });

        directoryApi.getMyTeachers().then((tList: Teacher[]) => {
          setTeachers(tList);
          localStorage.setItem('edu_cache_teachers', JSON.stringify(tList));
        }).catch(err => console.error("Failed to load student teachers:", err));

        if (user?.role === 'parent') {
          refreshParentFees();
        }
      }

    }
  }, [authState]);

  const getParentFees = async (): Promise<ParentFeeItem[]> => {
    if (parentFees.length === 0) {
      await refreshParentFees();
    }
    return parentFees;
  };

  const fetchStudentData = async (sid: number) => {
    try {
      // Events are loaded once into the shared `events` slice by
      // refreshEvents (called from refreshDirectory on auth) and consumed
      // by both the parent Dashboard and the Events page — so we no longer
      // re-fetch /events here. Previously this fired a second, identical
      // getEvents() on every login alongside refreshEvents.
      const [m, a] = await Promise.all([
        marksApi.getMarks(sid),
        attendanceApi.getAttendance(sid),
      ]);
      setStudentMarks(m);
      setStudentAttendance(a);
      localStorage.setItem('edu_cache_student_marks', JSON.stringify(m));
      localStorage.setItem('edu_cache_student_attendance', JSON.stringify(a));
    } catch (err) {
      console.error("Error fetching student data:", err);
    }
  };

  return (
    <AppContext.Provider value={{
      students,
      classDirectory: students,
      teachers,
      teacherDirectory: teachers,
      grades,
      sections,
      subjects,
      schoolClasses,
      refreshDirectory,
      refreshStudents,
      refreshTeachers,
      isDirectoryLoading,
      isAcademicLoading,
      isEventsLoading,
      studentProfile,
      studentMarks,
      studentAttendance,
      events,
      fetchStudentData,
      classMarks,
      fetchClassMarks,
      teacherSubject,
      aiAnalysis,
      setAiAnalysis,
      teacherStats,
      fetchTeacherStats,
      institutionId,
      setInstitutionId,
      institutionName,
      setInstitutionName,
      institutionLogoUrl,
      setInstitutionLogoUrl,
      activeAssignmentId,
      setActiveAssignmentId,
      fetchSubjectSummary,
      subjectSummaries,
      parentFees,
      refreshParentFees,
      getParentFees,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook lives alongside its provider on purpose; splitting it would force
// every consumer to import from two paths for no real win.
// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
