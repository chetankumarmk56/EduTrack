import client from './client';

export interface TeacherStats {
    total_students: number;
    active_classes: number;
    attendance_rate: number;
    pending_marks: number;
}

export const statisticsApi = {
    /**
     * Fetch summary metrics for the logged-in teacher's dashboard.
     */
    getTeacherStats: async () => {
        const response = await client.get<TeacherStats>('directory/teacher/dashboard/stats');
        return response.data;
    }
};

export default statisticsApi;
