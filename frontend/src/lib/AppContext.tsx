import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { directoryApi } from '../api/directoryApi';
import { academicApi } from '../api/academicApi';
import { marksApi } from '../api/marksApi';
import { attendanceApi } from '../api/attendanceApi';
import { eventsApi } from '../api/eventsApi';
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
  teacherSubject: string;

  aiAnalysis: any | null;
  setAiAnalysis: (analysis: any | null) => void;
  teacherStats: any | null;
  fetchTeacherStats: () => Promise<void>;
  institutionId: number;
  setInstitutionId: (id: number) => void;
  institutionName: string;
  setInstitutionName: (name: string) => void;
  activeAssignmentId: number | null;
  setActiveAssignmentId: (id: number | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { authState, user } = useAuth();
  
  // Data
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [lastFetched, setLastFetched] = useState<number>(0);
  
  // Marks state for teachers
  const [classMarks, setClassMarks] = useState<Record<string, any[]>>({});

  // Student specific
  const [studentProfile, setStudentProfile] = useState<any | null>(null);
  const [studentMarks, setStudentMarks] = useState<any[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [studentEvents, setStudentEvents] = useState<any[]>([]);

  const [aiAnalysis, setAiAnalysis] = useState<any | null>(null);
  const [teacherStats, setTeacherStats] = useState<any | null>(null);

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

  useEffect(() => {
    if (activeAssignmentId) {
      localStorage.setItem('edu_active_assignment_id', String(activeAssignmentId));
    } else {
      localStorage.removeItem('edu_active_assignment_id');
    }
  }, [activeAssignmentId]);

  const refreshDirectory = async (force: boolean = false) => {
    const now = Date.now();
    if (!force && lastFetched && (now - lastFetched < 60000) && students.length > 0) {
      return;
    }

    try {
      // Role-based student fetching
      const studentsFetchPromise = user?.role === 'teacher' 
        ? directoryApi.getMyStudents() 
        : (user?.role === 'admin' || user?.role === 'super_admin' 
            ? directoryApi.getStudents(0, 1000)
            : Promise.resolve([]) // Students/Parents shouldn't load the full directory
          );

      const [studentsData, teachersData, gradesData, sectionsData, subjectsData, schoolClassesData, eventsData] = await Promise.all([
         studentsFetchPromise,
         directoryApi.getTeachers(),
         academicApi.getClasses(),
         academicApi.getSections(),
         academicApi.getSubjects(),
         academicApi.getSchoolClasses(),
         eventsApi.getEvents()
      ]);
      setStudents(studentsData);
      setTeachers(teachersData);
      setGrades(gradesData);
      setSections(sectionsData);
      setSubjects(subjectsData);
      setSchoolClasses(schoolClassesData);
      setEvents(eventsData);
      setLastFetched(now);
    } catch(err) {
      console.error("Directory Fetch Error:", err);
    }
  };

  const fetchClassMarks = async (subject: string, schoolClassId?: number, examId?: number) => {
    try {
      const data = await marksApi.getClassMarks(subject, schoolClassId, examId);
      const cacheKey = `${subject}_${schoolClassId || 'all'}_${examId || 'all'}`;
      setClassMarks(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch (err) {
      console.error("Error fetching class marks:", err);
      return [];
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
         directoryApi.getMyProfile().then(profile => {
            setStudentProfile(profile);
            fetchStudentData(profile.id);
         }).catch(() => {
            if (user?.id) fetchStudentData(user.id);
         });
      }
    }
  }, [authState]);

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
      activeAssignmentId, setActiveAssignmentId
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
