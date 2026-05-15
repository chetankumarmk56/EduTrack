import apiClient from '@/shared/services/apiClient';

export interface TeacherAttendanceRecord {
  id: number;
  teacher_id: number;
  teacher_name: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';
  remarks: string | null;
  is_edited: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface TeacherLeaveRecord {
  id: number;
  teacher_id: number;
  teacher_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approved_by_id: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

export interface PaginatedAttendanceResponse {
  total: number;
  items: TeacherAttendanceRecord[];
}

export interface PaginatedLeaveResponse {
  total: number;
  items: TeacherLeaveRecord[];
}

export const teacherAttendanceService = {
  getTodayStatus: async (): Promise<TeacherAttendanceRecord | null> => {
    const res = await apiClient.get('/api/teacher-attendance/my/today');
    return res.data;
  },

  checkIn: async (remarks?: string): Promise<TeacherAttendanceRecord> => {
    const res = await apiClient.post('/api/teacher-attendance/my/check-in', { remarks });
    return res.data;
  },

  checkOut: async (remarks?: string): Promise<TeacherAttendanceRecord> => {
    const res = await apiClient.post('/api/teacher-attendance/my/check-out', { remarks });
    return res.data;
  },

  getMyHistory: async (params?: {
    skip?: number;
    limit?: number;
  }): Promise<PaginatedAttendanceResponse> => {
    const res = await apiClient.get('/api/teacher-attendance/my/history', { params });
    return res.data;
  },

  applyLeave: async (data: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
  }): Promise<TeacherLeaveRecord> => {
    const res = await apiClient.post('/api/teacher-attendance/my/leave', data);
    return res.data;
  },

  getMyLeaves: async (params?: {
    skip?: number;
    limit?: number;
  }): Promise<PaginatedLeaveResponse> => {
    const res = await apiClient.get('/api/teacher-attendance/my/leave', { params });
    return res.data;
  },

  cancelLeave: async (leaveId: number): Promise<TeacherLeaveRecord> => {
    const res = await apiClient.post(`/api/teacher-attendance/my/leave/${leaveId}/cancel`);
    return res.data;
  },
};
