import client from '@/shared/api/client';

export interface LessonDayPayload {
  date: string;
  topic: string;
  subtopics: string[];
  objectives: string[];
  duration_hours: number;
}

export interface ExportLessonPlanPDFRequest {
  lesson_plan: LessonDayPayload[];
  subject?: string;
  start_date?: string;
  end_date?: string;
  warning_message?: string;
  document_name?: string;
  filename?: string;
}

export const lessonPlanApi = {
  exportPdf: async (payload: ExportLessonPlanPDFRequest): Promise<Blob> => {
    const res = await client.post('lesson-plan/export-pdf', payload, {
      responseType: 'blob',
    });
    return res.data as Blob;
  },
};
