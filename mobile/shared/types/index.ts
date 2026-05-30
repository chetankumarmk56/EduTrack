export interface Announcement {
  id: string;
  title: string;
  message: string;
  // Backend returns uppercase: 'CLASS' | 'STUDENT'
  type: 'CLASS' | 'STUDENT' | 'class' | 'student';
  // Backend collapsed to NORMAL/IMPORTANT in 2026-05; 'low/medium/high'
  // unions kept for backward-compat with any cached records during rollout.
  priority: 'NORMAL' | 'IMPORTANT' | 'LOW' | 'MEDIUM' | 'HIGH';
  school_class?: {
    id: number;
    grade: { name: string };
    section: { name: string };
  };
  class_id?: number;
  student_id?: number;
  attachment_url?: string;
  teacher_id: number;
  teacher_name?: string;
  institution_id: number;
  created_at: string;
  is_read?: boolean;
  read_count?: number;
  target_count?: number;
}

export interface StudentDues {
  student_id: number;
  student_name: string;
  total_due: number;
  total_paid?: number;
  due_date?: string | null;
  is_overdue?: boolean;
  breakdown: {
    fee_type: string;
    total: number;
    paid: number;
    due: number;
  }[];
}

export interface ParentFee {
  student_name: string;
  total_amount: number;
  amount_paid: number;
  due_amount: number;
  due_date: string;
  status: string;
  overdue_days: number;
}

export interface MarkSubjectRef {
  id: number;
  name: string;
  code?: string;
}

export interface MarkExam {
  id: number;
  name: string;
  term?: string;
  date?: string;
}

export interface Mark {
  id: number;
  student_id: number;
  // Legacy field — may be null for newer records; use subject_ref.name as primary
  subject?: string;
  // Legacy field — may be null for newer records; use exam.name as primary
  test_name?: string;
  exam_id?: number;
  subject_id?: number;
  score: number;
  max_score: number;
  // Resolved relations from backend
  subject_ref?: MarkSubjectRef;
  exam?: MarkExam;
}

export interface AttendanceRecord {
  id: number;
  student_id: number;
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  subject?: string;
}

export interface StudentProfile {
  id: number;
  name: string;
  class_level?: string;
  section?: string;
  school_class?: {
    id: number;
    grade?: { level: number; name: string };
    section?: { name: string };
    display_name?: string;
  };
  dob?: string;
  roll_no?: string | number;
  // Server-assigned alphabetical position within the class.
  roll_number?: number | null;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  whatsapp?: string;
  user_id?: number;
}

export interface TeacherAssignment {
  id: number;
  school_class?: {
    id?: number;
    display_name?: string;
    grade?: { level?: number; name?: string };
    section?: { name?: string };
  };
  subject_ref?: { id?: number; name?: string; code?: string };
}

export interface Teacher {
  id: number;
  user_id?: number;
  name: string;
  email?: string;
  phone?: string | null;
  whatsapp?: string | null;
  is_active?: boolean;
  subjects?: string[];
  role?: string;
  class_id?: number;
  assignments?: TeacherAssignment[];
}

export interface SchoolEvent {
  id: number;
  title: string;
  description?: string;
  // Backend EventResponse uses `date` and `type`. Mobile keeps `event_date`/`event_type`
  // aliases for backward-compat (set by services/eventsService.normalizeEvent).
  date?: string;
  end_date?: string;
  type?: string;
  category?: string;
  time?: string;
  location?: string;
  is_holiday?: boolean;
  visibility?: { parents?: boolean; teachers?: boolean; students?: boolean };
  event_date: string;
  event_type: string;
  class_id?: number;
  institution_id?: number;
  created_at?: string;
}

export interface Payment {
  id: number;
  student_id: number;
  amount: number;
  fee_type: string;
  due_date: string;
  paid_date?: string;
  status: 'pending' | 'paid' | 'overdue';
  total_amount: number;
  paid_amount: number;
  due_amount: number;
}

export interface Dashboard {
  student_info: StudentProfile;
  overall_attendance: number;
  unread_announcements: number;
  pending_fees: number;
  recent_marks?: Mark[];
  upcoming_events?: SchoolEvent[];
}

export interface AIQuestion {
  question: string;
  options?: string[];
  answer?: string;
  type?: string;
}

// ---------- Timetable ----------

export type SchedulePeriodType = 'class_period' | 'break' | 'lunch' | 'assembly';

export interface SchedulePeriod {
  id: number;
  name: string;
  period_type: SchedulePeriodType;
  order: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

export interface TimetableSlot {
  id: number;
  school_class_id: number;
  schedule_period_id: number;
  day_of_week: number; // 0=Mon ... 6=Sun
  subject_id?: number | null;
  teacher_id?: number | null;
  room?: string | null; // legacy
  subject?: { id: number; name: string; code?: string } | null;
  teacher?: { id: number; name: string } | null;
  school_class?: { id: number; display_name?: string; room_number?: string } | null;
}

export interface ClassTimetable {
  school_class_id: number;
  school_class?: { id: number; display_name?: string; room_number?: string };
  periods: SchedulePeriod[];
  slots: TimetableSlot[];
}

export interface TeacherTimetable {
  teacher_id: number;
  periods: SchedulePeriod[];
  slots: TimetableSlot[];
}
