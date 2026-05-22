/**
 * Shapes mirrored 1:1 from
 * `backend/app/schemas/lesson_plan/lesson_plan.py`.
 *
 * The ID-based layout means *only* the 5 IDs travel in URLs and S3 keys.
 * No human-readable subject / chapter names appear anywhere in the path.
 */

export interface ChapterIdentity {
  school_id: string;
  teacher_id: string;
  grade_id: string;
  subject_id: string;
  chapter_id: string;
}

export interface LessonPlanMetadata extends ChapterIdentity {
  number_of_classes: number;
  additional_info: string;
  resources: string[];
  // Display + scheduling context, all optional for back-compat.
  chapter_name?: string | null;
  grade_label?: string | null;
  section_label?: string | null;
  subject_label?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  session_dates?: string[];
  color_hue?: number | null;
}

export interface ChapterListItem {
  metadata: LessonPlanMetadata;
  lesson_plan: GeneratedLessonPlan | null;
  has_output: boolean;
  last_modified?: string | null;
}

export interface ChapterListResponse {
  chapters: ChapterListItem[];
}

export interface DeleteChapterResponse {
  deleted_keys: number;
}

export interface UploadResponse {
  resources: string[];
  metadata_path: string;
}

export interface GenerateResponse {
  output_path: string;
}

export interface HomeworkBlock {
  questions: string[];
  estimated_time_minutes?: number;
}

export interface LessonPlanTopic {
  topic_name: string;
  subtopics: string[];
}

export interface LessonPlanScheduleItem {
  class_number: number;
  topics: LessonPlanTopic[];
  learning_objectives: string[];
  teacher_tip?: string;
  homework?: HomeworkBlock;
  [key: string]: unknown;
}

export interface GeneratedLessonPlan {
  subject: string;
  chapter_title: string;
  academic_year?: string;
  total_classes: number;
  schedule: LessonPlanScheduleItem[];
  [key: string]: unknown;
}

export interface LessonPlanOutputResponse {
  output_path: string;
  metadata: LessonPlanMetadata;
  lesson_plan: GeneratedLessonPlan;
  provider_meta: Record<string, unknown>;
}
