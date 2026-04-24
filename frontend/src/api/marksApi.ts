import client from './client';

export interface Mark {
    id: number;
    student_id: number;
    subject: string;
    test_name: string;
    score: number;
    max_score: number;
    recorded_at: string;
}

export interface MarkCreate {
    student_id: number;
    subject: string;
    test_name: string;
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

export const marksApi = {
    /**
     * Fetch formal assessment records for a class/subject.
     */
    getExams: async (classId?: number, subjectId?: number) => {
        const params: any = {};
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
        const params: any = {};
        if (classId) params.school_class_id = classId;
        if (subjectId) params.subject_id = subjectId;
        const response = await client.post<Exam>('marks/exams', exam, { params });
        return response.data;
    },

    /**
     * Fetch all marks for a specific student.
     */
    getMarks: async (studentId: number) => {
        const response = await client.get<Mark[]>(`marks/${studentId}`);
        return response.data;
    },

    /**
     * Fetch marks for a specific subject/class (Teacher view).
     */
    getClassMarks: async (subject: string, schoolClassId?: number, examId?: number) => {
        const params: any = schoolClassId ? { school_class_id: schoolClassId } : {};
        if (examId) params.exam_id = examId;
        const response = await client.get<Mark[]>(`marks/subject/${subject}`, { params });
        return response.data;
    },

    /**
     * Record a single mark.
     */
    recordMark: async (data: MarkCreate) => {
        const response = await client.post<Mark>('marks/', data);
        return response.data;
    },

    /**
     * Sync a batch of marks (Teacher bulk entry).
     */
    recordMarksBatch: async (marks: MarkCreate[]) => {
        const response = await client.post<Mark[]>('marks/batch', marks);
        return response.data;
    },

    /**
     * Rename an assessment/test across a subject.
     */
    updateTestName: async (subject: string, oldName: string, newName: string) => {
        const response = await client.put(`marks/tests/${subject}/${oldName}`, null, {
            params: { new_name: newName }
        });
        return response.data;
    },

    /**
     * Delete an entire assessment/test.
     */
    deleteTest: async (subject: string, testName: string) => {
        const response = await client.delete(`marks/tests/${subject}/${testName}`);
        return response.data;
    }
};
 
export default marksApi;
