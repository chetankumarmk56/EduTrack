import client from '@/shared/api/client';

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

export interface AuditLogRecord {
  id: number;
  teacher_id: number;
  entity_type: string;
  entity_id: number | null;
  changed_by_id: number;
  changed_by_name: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string | null;
}

export interface AttendanceSummary {
  teacher_id: number;
  teacher_name: string;
  present: number;
  absent: number;
  half_day: number;
  on_leave: number;
  total_days: number;
}

export interface PaginatedAttendanceResponse {
  total: number;
  items: TeacherAttendanceRecord[];
}

export interface PaginatedLeaveResponse {
  total: number;
  items: TeacherLeaveRecord[];
}

export const teacherAttendanceApi = {
  // ── Teacher-facing ───────────────────────────────────────────────────────

  getTodayStatus: async (): Promise<TeacherAttendanceRecord | null> => {
    const res = await client.get('teacher-attendance/my/today');
    return res.data;
  },

  checkIn: async (remarks?: string): Promise<TeacherAttendanceRecord> => {
    const res = await client.post('teacher-attendance/my/check-in', { remarks });
    return res.data;
  },

  checkOut: async (remarks?: string): Promise<TeacherAttendanceRecord> => {
    const res = await client.post('teacher-attendance/my/check-out', { remarks });
    return res.data;
  },

  getMyHistory: async (params?: {
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
  }): Promise<PaginatedAttendanceResponse> => {
    const res = await client.get('teacher-attendance/my/history', { params });
    return res.data;
  },

  applyLeave: async (data: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
  }): Promise<TeacherLeaveRecord> => {
    const res = await client.post('teacher-attendance/my/leave', data);
    return res.data;
  },

  getMyLeaves: async (params?: {
    status?: string;
    skip?: number;
    limit?: number;
  }): Promise<PaginatedLeaveResponse> => {
    const res = await client.get('teacher-attendance/my/leave', { params });
    return res.data;
  },

  cancelLeave: async (leaveId: number): Promise<TeacherLeaveRecord> => {
    const res = await client.post(`teacher-attendance/my/leave/${leaveId}/cancel`);
    return res.data;
  },

  // ── Admin-facing ─────────────────────────────────────────────────────────

  adminListAttendance: async (params?: {
    teacher_id?: number;
    date_from?: string;
    date_to?: string;
    status?: string;
    skip?: number;
    limit?: number;
    /**
     * When true (default), the backend fills in synthetic ABSENT rows
     * for any working day in the requested range that has no stored
     * record. This is what makes "Absent" filtering actually surface
     * teachers who never check in.
     */
    include_absent?: boolean;
  }): Promise<PaginatedAttendanceResponse> => {
    const res = await client.get('teacher-attendance/admin/attendance', { params });
    return res.data;
  },

  adminEditAttendance: async (
    teacherId: number,
    data: {
      date: string;
      status: string;
      check_in_time?: string;
      check_out_time?: string;
      remarks?: string;
    }
  ): Promise<TeacherAttendanceRecord> => {
    const res = await client.put(`teacher-attendance/admin/attendance/${teacherId}`, data);
    return res.data;
  },

  adminListLeaves: async (params?: {
    teacher_id?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
  }): Promise<PaginatedLeaveResponse> => {
    const res = await client.get('teacher-attendance/admin/leave', { params });
    return res.data;
  },

  adminApproveLeave: async (leaveId: number): Promise<TeacherLeaveRecord> => {
    const res = await client.post(`teacher-attendance/admin/leave/${leaveId}/approve`);
    return res.data;
  },

  adminRejectLeave: async (leaveId: number, rejection_reason?: string): Promise<TeacherLeaveRecord> => {
    const res = await client.post(`teacher-attendance/admin/leave/${leaveId}/reject`, { rejection_reason });
    return res.data;
  },

  adminGetAuditLogs: async (params?: {
    teacher_id?: number;
    skip?: number;
    limit?: number;
  }): Promise<{ total: number; items: AuditLogRecord[] }> => {
    const res = await client.get('teacher-attendance/admin/audit-logs', { params });
    return res.data;
  },

  adminGetSummary: async (params?: {
    teacher_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<AttendanceSummary[]> => {
    const res = await client.get('teacher-attendance/admin/summary', { params });
    return res.data;
  },
};
