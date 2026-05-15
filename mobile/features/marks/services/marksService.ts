import apiClient from '@/shared/services/apiClient';
import { Mark } from '@/shared/types';

export const marksService = {
  /**
   * Get all marks for a student
   */
  getMarks: async (studentId: number): Promise<Mark[]> => {
    console.log('[marksService] Fetching marks for student:', studentId);
    try {
      const res = await apiClient.get(`marks/${studentId}`);
      console.log('[marksService] Success. Marks count:', res.data?.length || 0);
      return res.data;
    } catch (error) {
      console.error('[marksService] Failed to fetch marks:', error);
      throw error;
    }
  },

  /**
   * Get marks for a specific subject
   */
  getMarksBySubject: async (studentId: number, subject: string): Promise<Mark[]> => {
    const res = await apiClient.get(`marks/${studentId}?subject=${subject}`);
    return res.data;
  },

  /**
   * Get subject-level class summary stats (avg/max/min/count of raw scores)
   * for a specific section. Used for "you vs class" comparison.
   */
  getSubjectSummary: async (subject: string, schoolClassId: number): Promise<{
    subject: string;
    school_class_id: number;
    average: number;
    max: number;
    min: number;
    count: number;
  }> => {
    const res = await apiClient.get(
      `marks/subject/${encodeURIComponent(subject)}/summary?school_class_id=${schoolClassId}`,
    );
    return res.data;
  },

  /**
   * Get student rankings within their section (class_rank) and entire grade level (grade_rank).
   */
  getRankings: async (studentId: number): Promise<{
    class_rank: number | null;
    class_total: number;
    grade_rank: number | null;
    grade_total: number;
    percentage: number;
    class_leaderboard?: { student_id: number; name: string; percentage: number; rank: number }[];
    grade_leaderboard?: { student_id: number; name: string; percentage: number; rank: number }[];
  } | null> => {
    const res = await apiClient.get(`marks/${studentId}/rankings`);
    return res.data;
  },

  /**
   * Get exam list
   */
  getExams: async (): Promise<any[]> => {
    const res = await apiClient.get('marks/exams');
    return res.data;
  },

  /**
   * Record marks for multiple students (Teacher only)
   */
  recordBatch: async (marks: any[]) => {
    const res = await apiClient.post('marks/batch', marks);
    return res.data;
  },

  /**
   * Get exams for a specific class and subject
   */
  getExamsForClass: async (classId: number, subjectId: number): Promise<any[]> => {
    const res = await apiClient.get(`marks/exams?school_class_id=${classId}&subject_id=${subjectId}`);
    return res.data;
  },

  getClassMarks: async (subject: string, classId: number, examId: number): Promise<Mark[]> => {
    const res = await apiClient.get(`marks/subject/${subject}?school_class_id=${classId}&exam_id=${examId}`);
    // Normalise: backend may return array directly or wrapped in an object
    const raw = res.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.marks)) return raw.marks;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  },
};
