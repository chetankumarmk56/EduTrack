/**
 * Lesson Plan API — storage only.
 *
 * Mirrors `backend/app/api/routes/lesson_plan/lesson_plan.py`. The
 * external lesson-plan microservice writes `output/lesson_plan.json`
 * to S3 directly; this frontend never calls it.
 */
import client from '@/shared/api/client';
import type {
  ChapterIdentity,
  ChapterListResponse,
  DeleteChapterResponse,
  LessonPlanOutputResponse,
  UploadResponse,
} from './types';

export interface UploadParams extends ChapterIdentity {
  files: File[];
  number_of_classes: number;
  additional_info?: string;
  // Optional context persisted on metadata.json so the dashboard can render
  // the chapter without re-querying the timetable.
  chapter_name?: string;
  grade_label?: string;
  section_label?: string;
  subject_label?: string;
  start_date?: string;
  end_date?: string;
  session_dates?: string[];
  color_hue?: number;
}

export const lessonPlanAIApi = {
  /**
   * SAVE — upload files + write metadata.json to S3.
   */
  upload: async (params: UploadParams): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('school_id', params.school_id);
    form.append('teacher_id', params.teacher_id);
    form.append('grade_id', params.grade_id);
    form.append('subject_id', params.subject_id);
    form.append('chapter_id', params.chapter_id);
    form.append('number_of_classes', String(params.number_of_classes));
    form.append('additional_info', params.additional_info ?? '');
    if (params.chapter_name) form.append('chapter_name', params.chapter_name);
    if (params.grade_label) form.append('grade_label', params.grade_label);
    if (params.section_label) form.append('section_label', params.section_label);
    if (params.subject_label) form.append('subject_label', params.subject_label);
    if (params.start_date) form.append('start_date', params.start_date);
    if (params.end_date) form.append('end_date', params.end_date);
    if (params.session_dates && params.session_dates.length > 0) {
      form.append('session_dates', JSON.stringify(params.session_dates));
    }
    if (typeof params.color_hue === 'number') {
      form.append('color_hue', String(params.color_hue));
    }
    for (const file of params.files) {
      form.append('files', file);
    }

    const res = await client.post('lesson-plan/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as UploadResponse;
  },

  /**
   * GENERATE — call the external AI microservice via the backend.
   *
   * The backend loads metadata.json from S3, sends it to the AI service,
   * waits for the service to write output/lesson_plan.json to S3, then
   * reads and returns the result. May take up to several minutes.
   */
  generate: async (
    identity: ChapterIdentity,
  ): Promise<LessonPlanOutputResponse> => {
    const res = await client.post('lesson-plan/generate', identity);
    return res.data as LessonPlanOutputResponse;
  },

  /**
   * FETCH OUTPUT — read output/lesson_plan.json directly from S3 without
   * triggering generation. 404 if the external microservice has not
   * produced output yet. Used by the standalone result page.
   */
  fetchOutput: async (
    identity: ChapterIdentity,
  ): Promise<LessonPlanOutputResponse> => {
    const res = await client.get('lesson-plan/output', { params: identity });
    return res.data as LessonPlanOutputResponse;
  },

  /**
   * LIST — every chapter the current teacher has saved, scoped to one
   * teacher prefix in S3.
   */
  listChapters: async (params: {
    school_id: string;
    teacher_id: string;
  }): Promise<ChapterListResponse> => {
    const res = await client.get('lesson-plan/chapters', { params });
    return res.data as ChapterListResponse;
  },

  /**
   * DELETE — remove every S3 object under a chapter prefix.
   */
  deleteChapter: async (
    identity: ChapterIdentity,
  ): Promise<DeleteChapterResponse> => {
    const res = await client.delete('lesson-plan/chapter', {
      params: identity,
    });
    return res.data as DeleteChapterResponse;
  },
};
