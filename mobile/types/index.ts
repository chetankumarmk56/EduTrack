export interface Announcement {
  id: string;
  title: string;
  message: string;
  // Backend returns uppercase: 'CLASS' | 'STUDENT'
  type: 'CLASS' | 'STUDENT' | 'class' | 'student';
  // Backend returns uppercase: 'LOW' | 'MEDIUM' | 'HIGH'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'low' | 'medium' | 'high';
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
  parent_phone?: string;
  parent_email?: string;
  whatsapp?: string;
  user_id?: number;
}

export interface Teacher {
  id: number;
  name: string;
  email: string;
  subjects?: string[];
  role?: string;
  phone?: string;
  whatsapp?: string;
  class_id?: number;
}

export interface SchoolEvent {
  id: number;
  title: string;
  description?: string;
  event_date: string;
  event_type: 'exam' | 'meeting' | 'holiday' | 'sports' | 'activity';
  class_id?: number;
  institution_id: number;
  created_at: string;
}

export interface Payment {
  id: number;
  student_id: number;
  amount: number;
  fee_type: string;
  due_date: string;
  paid_date?: string;
  status: 'pending' | 'paid' | 'overdue';
  razorpay_order_id?: string;
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
