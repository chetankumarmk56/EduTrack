import apiClient from './apiClient';
import { AttendanceRecord } from '../types';

export const attendanceService = {
  /**
   * Get attendance records for a student
   */
  getAttendance: async (studentId: number): Promise<AttendanceRecord[]> => {
    console.log('[attendanceService] Fetching attendance for student:', studentId);
    try {
      const res = await apiClient.get(`attendance/${studentId}`);
      console.log('[attendanceService] Success. Records count:', res.data?.length || 0);
      return res.data;
    } catch (error) {
      console.error('[attendanceService] Failed to fetch attendance:', error);
      throw error;
    }
  },

  /**
   * Get class-wide attendance for context
   */
  getClassAttendance: async (classId: number): Promise<any[]> => {
    const res = await apiClient.get(`attendance/class/${classId}`);
    return res.data;
  },

  /**
   * Get attendance statistics (percentage, days present/absent, etc.)
   */
  getAttendanceStats: async (studentId: number): Promise<any> => {
    const res = await apiClient.get(`attendance/${studentId}/stats`);
    return res.data;
  },

  /**
   * Get attendance by date range
   */
  getAttendanceByDateRange: async (studentId: number, startDate: string, endDate: string): Promise<AttendanceRecord[]> => {
    const res = await apiClient.get(`attendance/${studentId}?start_date=${startDate}&end_date=${endDate}`);
    return res.data;
  },

  /**
   * Mark attendance for multiple students (Teacher only)
   */
  markBatch: async (data: { school_class_id: number; date: string; subject?: string; records: { student_id: number; status: string }[] }) => {
    const res = await apiClient.post('attendance/batch', data);
    return res.data;
  },
};
