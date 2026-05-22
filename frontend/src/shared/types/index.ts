export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student' | 'parent' | 'finance';

export interface User {
  id: number;
  name: string;
  email?: string;
  role: UserRole;
  institution_id?: number;
  is_active: boolean;
}

export interface Institution {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export interface Grade {
  id: number;
  level: number;
  name: string;
  tuition_fee?: number;
  fee_due_date?: string;
}

export interface Section {
  id: number;
  name: string;
  grade_id: number;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
}

export interface SchoolClass {
  id: number;
  display_name?: string;
  room_number?: string;
  grade_id: number;
  section_id: number;
  grade?: Grade;
  section?: Section;
  // Legacy field returned by some API endpoints
  class_level?: string;
  total_fee?: number;
  tuition_fee?: number;
  fee_due_date?: string;
}

export interface Parent {
  id: number;
  user_id: number;
  name: string;
  phone?: string;
  relation?: string;
  is_active: boolean;
  // Present when parent is fetched as part of a user record
  user?: { id: number; email?: string };
}

export interface Student {
  id: number;
  user_id: number;
  name: string;
  dob?: string;
  whatsapp?: string;
  alternate?: string;
  is_active: boolean;
  parent?: Parent;
  classroom?: SchoolClass;
  school_class?: SchoolClass;
  school_class_id?: number;
  // Server-assigned alphabetical position within the class.
  roll_number?: number | null;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  // Legacy fields returned by older API endpoints
  class_level?: string;
  section?: string;
}

export interface TeacherAssignment {
  id: number;
  school_class: SchoolClass;   // field name returned by the API
  classroom?: SchoolClass;     // legacy alias used in some places
  subject_ref: Subject;
  school_class_id?: number;
  subject_id?: number;
  class_level?: string;
  section?: string;
  subject?: string;
}

export interface Teacher {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  subject_specialty?: string;
  subject?: string;
  phone?: string;
  whatsapp?: string;
  is_active: boolean;
  assignments: TeacherAssignment[];
}

export interface Attendance {
  id: number;
  student_id: number;
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  school_class_id?: number;
  classroom?: SchoolClass;
  subject_ref?: Subject;
  subject?: string;
}

export interface Exam {
  id: number;
  name: string;
  term?: string;
  date?: string;
  school_class_id?: number;
  subject_id?: number;
}

export interface Mark {
  id: number;
  student_id: number;
  exam_id?: number;
  school_class_id?: number;
  score: number;
  max_score: number;
  exam?: Exam;
  subject_ref?: Subject;
  subject?: string;
}

export interface Event {
  id: number;
  title: string;
  description?: string;
  type: string;
  date: string;
  end_date?: string;
  time: string;
  location: string;
  is_holiday?: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  audience: string;
  created_at: string;
  expires_at?: string;
  created_by_id?: number;
}

export interface TeacherStats {
  total_students: number;
  active_classes: number;
  attendance_rate: number;
  pending_marks: number;
}

export interface SubjectSummary {
  average: number;
  count: number;
  [key: string]: unknown;
}

/** Fee record returned by GET /api/parent/fees (parents.py route) */
export interface ParentFeeItem {
  student_name: string;
  total_amount: number;
  amount_paid: number;
  due_amount: number;
  due_date: string | null;
  status: string;
  overdue_days: number;
}

/**
 * AI analysis result — shape varies by feature (lesson plan vs question bank).
 * Arrays typed as unknown[] so pages can cast to their own local types.
 */
export interface AiAnalysisResult {
  question_bank?: unknown[];
  lesson_plan?: unknown[];
  suggested_ppt_slides?: unknown;
  reconsideration_required?: boolean;
  warning_message?: string;
  document_name?: string;
  [key: string]: unknown;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  institution_id?: number;
  // Human-readable school name (e.g. "St. Mary's High School").
  // Populated by every login endpoint; consumed by the dashboard so the
  // sidebar shows the school name instead of falling back to
  // "Institution <id>".
  institution_name?: string;
  user: {
    id: number;
    name: string;
    email?: string;
  };
}

export interface DocumentResponse {
  id: number;
  filename: string;
  type: string;
  size?: number;
  created_at?: string;
  url?: string;
}

// ---------- Timetable ----------

export type SchedulePeriodType = 'class_period' | 'break' | 'lunch' | 'assembly';

export interface SchedulePeriod {
  id: number;
  name: string;
  period_type: SchedulePeriodType;
  order: number;
  start_time: string;  // "HH:MM:SS"
  end_time: string;
}

export interface TimetableSlot {
  id: number;
  school_class_id: number;
  schedule_period_id: number;
  day_of_week: number;     // 0=Mon ... 6=Sun
  subject_id?: number | null;
  teacher_id?: number | null;
  room?: string | null;    // legacy per-slot override (no longer set from UI)
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
