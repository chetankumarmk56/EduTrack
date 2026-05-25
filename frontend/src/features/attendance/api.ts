import client from '@/shared/api/client';

export interface AttendanceRecord {
    id: number;
    student_id: number;
    date: string;
    status: 'Present' | 'Absent' | 'Late' | 'Excused';
    subject?: string;
    school_class_id?: number;
}

export interface AttendanceCreate {
    student_id: number;
    date: string;
    status: string;
    subject?: string;
    school_class_id?: number;
}

export interface AttendanceBatch {
    date: string;
    school_class_id: number;
    subject?: string;
    records: { student_id: number; status: string }[];
}

export const attendanceApi = {
    /**
     * Mark attendance for a single student.
     */
    markAttendance: async (data: AttendanceCreate) => {
        const response = await client.post<AttendanceRecord>('attendance/', data);
        return response.data;
    },

    /**
     * Submit a batch of attendance records (Class/Subject view).
     */
    markAttendanceBatch: async (data: AttendanceBatch) => {
        const response = await client.post<AttendanceRecord[]>('attendance/batch', data);
        return response.data;
    },

    /**
     * Fetch attendance history for a specific student.
     *
     * The backend defaults to the last 90 days when no range is given.
     * Callers that need full history (report cards, year-end exports)
     * must pass an explicit dateFrom — see backend
     * attendance.py:_DEFAULT_WINDOW_DAYS.
     */
    getAttendance: async (
        studentId: number,
        subject?: string,
        dateFrom?: string,
        dateTo?: string,
    ) => {
        const params: Record<string, string> = {};
        if (subject) params.subject = subject;
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        const response = await client.get<AttendanceRecord[]>(
            `attendance/${studentId}`,
            { params },
        );
        return response.data;
    },

    /**
     * Fetch attendance for an entire class on a specific date.
     */
    getClassAttendance: async (classId: number, date: string, subject?: string) => {
        const params = subject ? { subject } : {};
        const response = await client.get<AttendanceRecord[]>(`attendance/class/${classId}/${date}`, { params });
        return response.data;
    }
};
