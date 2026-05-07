import apiClient from './apiClient';
import { Dashboard } from '../types';

export const dashboardService = {
  /**
   * Get complete dashboard data including student info, attendance, announcements, fees, marks
   */
  getDashboard: async (): Promise<Dashboard> => {
    const res = await apiClient.get('/dashboard');
    return res.data;
  },

  getTeacherDashboard: async (): Promise<any> => {
    const res = await apiClient.get('/directory/teacher/dashboard/stats');
    return res.data;
  },
};
