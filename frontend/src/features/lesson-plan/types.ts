export interface LessonPlanInput {
  file: File;
  startDate: string;
  endDate: string;
  classesPerWeek: number;
  hoursPerClass: number;
}

export interface LessonDay {
  date: string;
  topic: string;
  subtopics: string[];
  objectives: string[];
  duration_hours: number;
}

export interface SessionAssignment {
  date: string;
  topics: string[];
}

export interface ExtractedTopics {
  topics: string[];
  isSimulated: boolean;
  warning?: string;
}

export interface LessonPlanResult {
  lesson_plan: LessonDay[];
  reconsideration_required: boolean;
  warning_message: string;
  suggested_ppt_slides: unknown[];
  document_name: string;
  [key: string]: unknown;
}
