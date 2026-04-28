import apiClient from './apiClient';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'class' | 'student';
  priority: 'low' | 'medium' | 'high';
  class_id?: number;
  student_id?: number;
  attachment_url?: string;
  teacher_id: number;
  teacher_name?: string;
  institution_id: number;
  created_at: string;
  is_read?: boolean;
}

export const announcementService = {
  getMyAnnouncements: async (): Promise<Announcement[]> => {
    const res = await apiClient.get('/announcements/my');
    return res.data;
  },

  getAttachmentUrl: (path: string, baseUrl: string): string => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = baseUrl.replace(/\/api\/?$/, '');
    return `${base}${path}`;
  },

  getAttachmentType: (url: string): 'image' | 'pdf' | 'doc' | 'video' | 'other' => {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(lower)) return 'image';
    if (/\.pdf/.test(lower)) return 'pdf';
    if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf)/.test(lower)) return 'doc';
    if (/\.(mp4|mov|avi|mp3|m4a)/.test(lower)) return 'video';
    if (lower.includes('/image/upload/')) return 'image';
    if (lower.includes('/video/upload/')) return 'video';
    if (lower.includes('/raw/upload/')) return 'doc';
    return 'other';
  },
};

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
  due_amount: number;
  due_date: string;
  overdue_days: number;
}

export const financeService = {
  getStudentDues: async (studentId: number): Promise<StudentDues> => {
    const res = await apiClient.get(`finance/students/${studentId}/dues`);
    return res.data;
  },

  getParentFees: async (): Promise<ParentFee[]> => {
    const res = await apiClient.get('parent/fees');
    return res.data;
  },

  createOrder: async (studentId: number, amount: number) => {
    const res = await apiClient.post('finance/payments/create-order', { student_id: studentId, amount });
    return res.data;
  },

  verifyPayment: async (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    const res = await apiClient.post('finance/payments/verify', data);
    return res.data;
  },
};

export interface Mark {
  id: number;
  student_id: number;
  subject: string;
  test_name: string;
  score: number;
  max_score: number;
  recorded_at: string;
}

export const marksService = {
  getMarks: async (studentId: number): Promise<Mark[]> => {
    const res = await apiClient.get(`marks/${studentId}`);
    return res.data;
  },
};

export interface AttendanceRecord {
  id: number;
  student_id: number;
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  subject?: string;
}

export const attendanceService = {
  getAttendance: async (studentId: number): Promise<AttendanceRecord[]> => {
    const res = await apiClient.get(`attendance/${studentId}`);
    return res.data;
  },
};

export interface StudentProfile {
  id: number;
  name: string;
  class_level?: string;
  section?: string;
  school_class?: {
    grade?: { level: number; name: string };
    section?: { name: string };
    display_name?: string;
  };
  dob?: string;
  user_id?: number;
}

export const directoryService = {
  getStudentProfile: async (studentId: number): Promise<StudentProfile> => {
    const res = await apiClient.get(`directory/students/${studentId}`);
    return res.data;
  },

  getMyStudents: async (): Promise<StudentProfile[]> => {
    const res = await apiClient.get('directory/students');
    return res.data;
  },

  getTeachers: async (): Promise<Teacher[]> => {
    const res = await apiClient.get('directory/my-teachers');
    return res.data;
  },
};

export interface Teacher {
  id: number;
  name: string;
  email: string;
  subjects?: string[];
  role?: string;
}

export interface AIQuestion {
  question: string;
  options?: string[];
  answer?: string;
  type?: string;
}

export const aiService = {
  generateQuestions: async (formData: FormData): Promise<{ questions: AIQuestion[] }> => {
    const res = await apiClient.post('ai/generate-questions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
