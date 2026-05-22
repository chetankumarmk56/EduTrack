import apiClient from '@/shared/services/apiClient';
import { StudentProfile, Teacher } from '@/shared/types';

export const directoryService = {
  getStudentProfile: async (studentId: number): Promise<StudentProfile> => {
    // console.log('[directoryService] Fetching student profile:', studentId);
    try {
      const res = await apiClient.get(`directory/students/${studentId}`);
      // console.log('[directoryService] Profile fetched:', res.data?.name);
      return res.data;
    } catch (error) {
      console.error('[directoryService] Failed to fetch profile:', error);
      throw error;
    }
  },

  getMyStudents: async (): Promise<StudentProfile[]> => {
    const res = await apiClient.get('directory/students');
    return res.data;
  },

  getTeachers: async (): Promise<Teacher[]> => {
    const res = await apiClient.get('directory/my-teachers');
    return res.data;
  },

  getMyProfile: async (): Promise<any> => {
    const res = await apiClient.get('directory/my-profile');
    return res.data;
  },

  getTeacherStudents: async (): Promise<StudentProfile[]> => {
    const res = await apiClient.get('directory/my-students');
    return res.data;
  },
};
