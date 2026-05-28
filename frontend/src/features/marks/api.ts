import client from '@/shared/api/client';
import type { Mark } from '@/shared/types';

// Duplicate/stale — Mark is defined in @/shared/types/index.ts with a different
// (newer) shape and is imported from there. Nothing imports this version.
// export interface Mark {
//     id: number;
//     student_id: number;
//     subject: string;
//     test_name: string;
//     score: number;
//     max_score: number;
//     recorded_at: string;
// }

export interface MarkCreate {
    student_id: number;
    subject: string;
    test_name?: string;
    subject_id?: number;
    exam_id?: number;
    score: number;
    max_score: number;
}

export interface Exam {
    id: number;
    name: string;
    term?: string;
    date?: string;
    school_class_id?: number;
    subject_id?: number;
}

export interface ExamCreate {
    name: string;
    term?: string;
    date?: string;
}

export interface LeaderboardEntry {
    student_id: number;
    name: string;
    average: number;
    rank: number;
    percentage?: number;
}

export interface RankingsResponse {
    class_rank?: number;
    class_total?: number;
    grade_rank?: number;
    grade_total?: number;
    class_leaderboard?: LeaderboardEntry[];
    grade_leaderboard?: LeaderboardEntry[];
}

export const marksApi = {
    /**
     * Fetch formal assessment records for a class/subject.
     */
    getExams: async (classId?: number, subjectId?: number) => {
        const params: Record<string, number> = {};
        if (classId) params.school_class_id = classId;
        if (subjectId) params.subject_id = subjectId;
        const response = await client.get<Exam[]>('marks/exams', { params });
        return response.data;
    },

    /**
     * Fetch aggregated statistics for a class/subject (Secure view for Parents/Students).
     */
    getSubjectSummary: async (subject: string, schoolClassId: number) => {
        const response = await client.get<{ average: number, count: number }>(
            `marks/subject/${subject}/summary`, 
            { params: { school_class_id: schoolClassId } }
        );
        return response.data;
    },

    /**
     * Create a formal assessment record.
     */
    createExam: async (exam: ExamCreate, classId?: number, subjectId?: number) => {
        const params: Record<string, number> = {};
        if (classId) params.school_class_id = classId;
        if (subjectId) params.subject_id = subjectId;
        const response = await client.post<Exam>('marks/exams', exam, { params });
        return response.data;
    },

    updateExam: async (examId: number, name: string) => {
        const response = await client.put<Exam>(`marks/exams/${examId}`, null, {
            params: { name }
        });
        return response.data;
    },

    deleteExam: async (examId: number) => {
        const response = await client.delete(`marks/exams/${examId}`);
        return response.data;
    },

    /**
     * Fetch marks for a specific student.
     *
     * The backend defaults to the last 365 days when no range is given.
     * Pass an explicit `dateFrom` for report-card / transcript views
     * that need the full history — see backend
     * marks.py:_DEFAULT_MARKS_WINDOW_DAYS.
     */
    getMarks: async (studentId: number, dateFrom?: string, dateTo?: string) => {
        const params: Record<string, string> = {};
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        const response = await client.get<Mark[]>(`marks/${studentId}`, { params });
        return response.data;
    },

    /**
     * Fetch marks for a specific subject/class (Teacher view).
     */
    getClassMarks: async (subject: string, schoolClassId?: number, examId?: number) => {
        const params: Record<string, number> = schoolClassId ? { school_class_id: schoolClassId } : {};
        if (examId) params.exam_id = examId;
        const response = await client.get<Mark[]>(`marks/subject/${subject}`, { params });
        return response.data;
    },

    // Unused — recordMarksBatch is used instead. Not called anywhere in the frontend.
    // recordMark: async (data: MarkCreate) => {
    //     const response = await client.post<Mark>('marks/', data);
    //     return response.data;
    // },

    /**
     * Sync a batch of marks (Teacher bulk entry).
     */
    recordMarksBatch: async (marks: MarkCreate[]) => {
        const response = await client.post<Mark[]>('marks/batch', marks);
        return response.data;
    },

    // Unused — not called anywhere in the frontend.
    // updateTestName: async (subject: string, oldName: string, newName: string) => {
    //     const response = await client.put(`marks/tests/${subject}/${oldName}`, null, {
    //         params: { new_name: newName }
    //     });
    //     return response.data;
    // },

    // Unused — not called anywhere in the frontend.
    // deleteTest: async (subject: string, testName: string) => {
    //     const response = await client.delete(`marks/tests/${subject}/${testName}`);
    //     return response.data;
    // },

    /**
     * Fetch dynamic rankings for a student.
     */
    getRankings: async (studentId: number) => {
        const response = await client.get<RankingsResponse>(`marks/${studentId}/rankings`);
        return response.data;
    }
};
 
export default marksApi;
