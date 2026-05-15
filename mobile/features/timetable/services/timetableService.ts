import apiClient from '@/shared/services/apiClient';
import type { ClassTimetable, TeacherTimetable } from '@/shared/types';

export const timetableService = {
  /** Currently logged-in teacher's full week schedule across all classes. */
  getMyTimetable: async (): Promise<TeacherTimetable> => {
    const res = await apiClient.get('/timetable/me');
    return res.data;
  },

  /** Full week timetable for a specific class — used by parent/student view. */
  getClassTimetable: async (classId: number): Promise<ClassTimetable> => {
    const res = await apiClient.get(`/timetable/class/${classId}`);
    return res.data;
  },
};
