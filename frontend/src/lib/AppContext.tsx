import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { directoryApi } from '../api/directoryApi';
import { marksApi } from '../api/marksApi';
import { attendanceApi } from '../api/attendanceApi';
import { eventsApi } from '../api/eventsApi';
import { financeApi } from '../api/financeApi';
import { notificationApi } from '../api/notificationApi';
import { useAuth } from './AuthContext';

interface AppContextType {
  // Data State
  students: any[];
  classDirectory: any[]; // Alias for backward compatibility
  teachers: any[];
  teacherDirectory: any[]; // Alias for backward compatibility
  grades: any[];
  sections: any[];
  subjects: any[];
  schoolClasses: any[];
  refreshDirectory: (force?: boolean) => Promise<void>;
  refreshStudents: () => Promise<void>;
  refreshTeachers: () => Promise<void>;
  
  // Loading States
  isDirectoryLoading: boolean;
  isAcademicLoading: boolean;
  isEventsLoading: boolean;
  
  // Student Portal Data
  studentProfile: any | null;
  studentMarks: any[];
  studentAttendance: any[];
  studentEvents: any[];
  events: any[];
  fetchStudentData: (studentId: number) => Promise<void>;

  // Teacher Portal Data
  classMarks: Record<string, any[]>;
  fetchClassMarks: (subject: string, schoolClassId?: number, examId?: number) => Promise<any[]>;
  fetchSubjectSummary: (subject: string, schoolClassId: number) => Promise<any>;
  subjectSummaries: Record<string, any>;

  aiAnalysis: any | null;
  setAiAnalysis: (analysis: any | null) => void;
  teacherStats: any | null;
  fetchTeacherStats: () => Promise<void>;
  teacherSubject: string;
  institutionId: number;
  setInstitutionId: (id: number) => void;
  institutionName: string;
  setInstitutionName: (name: string) => void;
  activeAssignmentId: number | null;
  setActiveAssignmentId: (id: number | null) => void;

  // Parent/Notification Data
  parentFees: any[];
  notifications: any[];
  refreshParentFees: () => Promise<void>;
  getParentFees: () => Promise<any[]>; // Lazy-load fees on-demand
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { authState, user } = useAuth();
  
  // Hydration from localStorage for instant UI
  const [students, setStudents] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_students');
    return saved ? JSON.parse(saved) : [];
  });
  const [teachers, setTeachers] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_teachers');
    return saved ? JSON.parse(saved) : [];
  });
  const [grades, setGrades] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_grades');
    return saved ? JSON.parse(saved) : [];
  });
  const [sections, setSections] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_sections');
    return saved ? JSON.parse(saved) : [];
  });
  const [subjects, setSubjects] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_subjects');
    return saved ? JSON.parse(saved) : [];
  });
  const [schoolClasses, setSchoolClasses] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_school_classes');
    return saved ? JSON.parse(saved) : [];
  });
  const [events, setEvents] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_events');
    return saved ? JSON.parse(saved) : [];
  });
  const [lastFetched, setLastFetched] = useState<number>(() => {
    const saved = localStorage.getItem('edu_cache_last_fetch');
    return saved ? Number(saved) : 0;
  });

  // Granular Loading
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
  const [isAcademicLoading, setIsAcademicLoading] = useState(false);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  
  // Marks state for teachers
  const [classMarks, setClassMarks] = useState<Record<string, any[]>>({});

  // Student specific
  const [studentProfile, setStudentProfile] = useState<any | null>(() => {
    const saved = localStorage.getItem('edu_cache_student_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [studentMarks, setStudentMarks] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_student_marks');
    return saved ? JSON.parse(saved) : [];
  });
  const [studentAttendance, setStudentAttendance] = useState<any[]>(() => {
    const saved = localStorage.getItem('edu_cache_student_attendance');
    return saved ? JSON.parse(saved) : [];
  });
  const [studentEvents, setStudentEvents] = useState<any[]>([]);

  const [aiAnalysis, setAiAnalysis] = useState<any | null>(null);
  const [teacherStats, setTeacherStats] = useState<any | null>(null);
  const [subjectSummaries, setSubjectSummaries] = useState<Record<string, any>>({});

  const fetchTeacherStats = async () => {
    try {
      const { statisticsApi } = await import('../api/statisticsApi');
      const data = await statisticsApi.getTeacherStats();
      setTeacherStats(data);
    } catch (err) {
      console.error("Error fetching teacher stats:", err);
    }
  };

  // Institution
  const [institutionId, setInstitutionId] = useState<number>(() => {
    const saved = localStorage.getItem('edu_institution_id');
    return saved ? Number(saved) : 1;
  });
  const [institutionName, setInstitutionName] = useState<string>(() => {
    return localStorage.getItem('edu_institution_name') || 'EduTrack Academy';
  });

  // Active Assignment Persistence
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('edu_active_assignment_id');
    return saved ? Number(saved) : null;
  });

  const [parentFees, setParentFees] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (activeAssignmentId) {
      localStorage.setItem('edu_active_assignment_id', String(activeAssignmentId));
    } else {
      localStorage.removeItem('edu_active_assignment_id');
    }
  }, [activeAssignmentId]);

  const refreshDirectory = async (force: boolean = false) => {
    const now = Date.now();
    // Use a slightly longer cache time for the initialization context (5 mins)
    if (!force && lastFetched && (now - lastFetched < 300000) && (students.length > 0)) {
      // Ensure events are at least attempted if they are missing from cache
      if (events.length === 0) refreshEvents();
      return;
    }

    // Only show full-page loading if we have absolutely no data
    const isInitialLoad = students.length === 0;
    if (isInitialLoad) {
      setIsDirectoryLoading(true);
      setIsAcademicLoading(true);
    }
    
    try {
      const { systemApi } = await import('../api/systemApi');
      const data = await systemApi.getInitialize();
      
      setLastFetched(now);
      localStorage.setItem('edu_cache_last_fetch', String(now));

      // 1. Academic Hydration & Persistence
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
      
      // 2. Directory Hydration & Persistence
      if (data.directory) {
        const s = data.directory.students || [];
        const t = data.directory.teachers || [];
        setStudents(s);
        setTeachers(t);
        localStorage.setItem('edu_cache_students', JSON.stringify(s));
        localStorage.setItem('edu_cache_teachers', JSON.stringify(t));
      } else if (data.students) {
        setStudents(data.students);
        localStorage.setItem('edu_cache_students', JSON.stringify(data.students));
      }
      
      // 3. Self-Record Hydration
      if (data.teacher_details) {
        const t_info = data.teacher_details;
        setTeachers(prev => {
          const exists = prev.find(t => t.id === t_info.id);
          if (exists) return prev;
          const newList = [...prev, t_info];
          localStorage.setItem('edu_cache_teachers', JSON.stringify(newList));
          return newList;
        });
      }

      // 4. Statistics Hydration
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
  };

  const refreshStudents = async () => {
    setIsDirectoryLoading(true);
    try {
      const data = await directoryApi.getStudents();
      setStudents(data);
    } catch (err) {
      console.error("Failed to load students:", err);
    } finally {
      setIsDirectoryLoading(false);
    }
  };

  const refreshTeachers = async () => {
    setIsDirectoryLoading(true);
    try {
      const data = await directoryApi.getTeachers();
      setTeachers(data);
    } catch (err) {
      console.error("Failed to load teachers:", err);
    } finally {
      setIsDirectoryLoading(false);
    }
  };

  const refreshEvents = async () => {
    setIsEventsLoading(true);
    try {
      const eventsData = await eventsApi.getEvents();
      setEvents(eventsData);
      localStorage.setItem('edu_cache_events', JSON.stringify(eventsData));
    } catch (err) {
      console.error("Events Fetch Error:", err);
    } finally {
      setIsEventsLoading(false);
    }
  };

  const refreshParentFees = async () => {
    try {
      const data = await financeApi.getParentFees();
      setParentFees(data);
    } catch (err) {
      console.error("Parent Fees Fetch Error:", err);
    }
  };

  const refreshNotifications = async () => {
    try {
      const data = await notificationApi.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error("Notifications Fetch Error:", err);
    }
  };

  const markNotificationRead = async (id: number) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error("Mark Read Error:", err);
    }
  };

  const [currentlyFetchingMarks, setCurrentlyFetchingMarks] = useState<string | null>(null);

  const fetchClassMarks = async (subject: string, schoolClassId?: number, examId?: number) => {
    const cacheKey = `${subject}_${schoolClassId || 'all'}_${examId || 'all'}`;
    
    // 1. Instant Cache Return: If we already have this data, return it immediately
    if (classMarks[cacheKey]) {
      // Still trigger a background refresh to ensure consistency, but return cache first
      marksApi.getClassMarks(subject, schoolClassId, examId).then(data => {
         setClassMarks(prev => ({ ...prev, [cacheKey]: data }));
      });
      return classMarks[cacheKey];
    }

    // Prevent concurrent requests for the same key
    if (currentlyFetchingMarks === cacheKey) return [];
    
    setCurrentlyFetchingMarks(cacheKey);
    try {
      const data = await marksApi.getClassMarks(subject, schoolClassId, examId);
      setClassMarks(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch (err) {
      console.error("Error fetching class marks:", err);
      return [];
    } finally {
      setCurrentlyFetchingMarks(null);
    }
  };

  const fetchSubjectSummary = async (subject: string, schoolClassId: number) => {
    const key = `${subject}_${schoolClassId}`;
    if (subjectSummaries[key]) return subjectSummaries[key];
    
    try {
      const data = await marksApi.getSubjectSummary(subject, schoolClassId);
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
      // Critical path: Load directory data first
      refreshDirectory();
      
      // Non-blocking: Load role-specific data
      if (user?.role === 'student' || user?.role === 'parent') {
         directoryApi.getMyProfile().then(profile => {
            setStudentProfile(profile);
            localStorage.setItem('edu_cache_student_profile', JSON.stringify(profile));
            fetchStudentData(profile.id);
            // NOTE: Parent fees will load on-demand when accessed, not on mount
         }).catch(() => {
            if (user?.id) fetchStudentData(user.id);
         });

         // Load assigned teachers for students/parents to populate the performance cards
         directoryApi.getMyTeachers().then(tList => {
            setTeachers(tList);
            localStorage.setItem('edu_cache_teachers', JSON.stringify(tList));
         }).catch(err => console.error("Failed to load student teachers:", err));
      }
      
      // OPTIMIZATION: Defer non-critical notifications to load after UI renders
      // This prevents blocking the initial page render
      const notificationTimer = setTimeout(() => {
        refreshNotifications();
      }, 500); // Load notifications after 500ms (after initial paint)
      
      return () => clearTimeout(notificationTimer);
    }
  }, [authState]);

  // OPTIMIZATION: Lazy-load parent fees only when actually accessed (not on mount)
  const getParentFees = async () => {
    if (parentFees.length === 0) {
      await refreshParentFees();
    }
    return parentFees;
  };

  const fetchStudentData = async (sid: number) => {
    try {
      const [m, a, e] = await Promise.all([
        marksApi.getMarks(sid),
        attendanceApi.getAttendance(sid),
        eventsApi.getEvents()
      ]);
      setStudentMarks(m);
      setStudentAttendance(a);
      setStudentEvents(e);
      
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
      studentEvents, 
      events,
      fetchStudentData, 
      classMarks,
      fetchClassMarks,
      teacherSubject,
      aiAnalysis, setAiAnalysis,
      teacherStats, fetchTeacherStats,
      institutionId, setInstitutionId,
      institutionName, setInstitutionName,
      activeAssignmentId, setActiveAssignmentId,
      fetchSubjectSummary, subjectSummaries,
      parentFees, notifications,
      refreshParentFees, getParentFees, refreshNotifications,
      markNotificationRead
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
