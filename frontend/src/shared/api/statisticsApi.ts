import client from './client';
import type { TeacherStats } from '@/shared/types';

// Duplicate removed — TeacherStats is defined in @/shared/types/index.ts.
// export interface TeacherStats { ... }

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
