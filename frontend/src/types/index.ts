export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student' | 'parent';

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
  grade_id: number;
  section_id: number;
  grade?: Grade;
  section?: Section;
}

export interface Parent {
  id: number;
  user_id: number;
  name: string;
  phone?: string;
  relation?: string;
  is_active: boolean;
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
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  // Legacy support
  class_level?: string;
  section?: string;
}

export interface TeacherAssignment {
  id: number;
  classroom: SchoolClass;
  subject_ref: Subject;
  // Legacy support
  class_level: string;
  section: string;
  subject: string;
}

export interface Teacher {
  id: number;
  user_id: number;
  name: string;
  email?: string;
  subject_specialty?: string;
  phone?: string;
  is_active: boolean;
  assignments: TeacherAssignment[];
}

export interface Attendance {
  id: number;
  student_id: number;
  date: string;
  status: 'Present' | 'Absent' | 'Late';
  classroom?: SchoolClass;
  subject_ref?: Subject;
  subject?: string;
}

export interface Exam {
  id: number;
  name: string;
  term?: string;
  date?: string;
}

export interface Mark {
  id: number;
  student_id: number;
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

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  institution_id?: number;
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
