import client from '@/shared/api/client';

export type QuestionType = 'mcq' | 'short' | 'long';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

// ─── S3 + external AI microservice flow (mirrors Lesson Plan) ───────────────
export interface QuestionBankIdentity {
  school_id: string;
  teacher_id: string;
  grade_id: string;
  subject_id: string;
  chapter_id: string;
}

export interface QuestionBankMetadata extends QuestionBankIdentity {
  // Microservice contract fields — mirrored in metadata.json.
  subject: string;
  grade: string;
  chapter: string;
  focus_topic?: string | null;
  focus_percentage?: number | null;
  focus_questions?: number | null;
  language: string;
  number_of_questions: number;
  total_marks: number;
  extra_instructions: string;
  // Internal bookkeeping.
  resources: string[];
}

export interface QuestionBankUploadResponse {
  resources: string[];
  metadata_path: string;
}

export interface GeneratedQuestion {
  id?: string | null;
  type?: string | null;
  difficulty?: string | null;
  bloom_level?: string | null;
  marks?: number | null;
  question: string;
  options?: string[] | null;
  answer?: string | null;
  explanation?: string | null;
  /** True when the microservice expects the teacher to attach a diagram. */
  diagram_required?: boolean | null;
  /** S3 key of the teacher-uploaded diagram. Resolve via {@link diagramUrl}. */
  diagram_image_key?: string | null;
  [key: string]: unknown;
}

export interface GeneratedQuestionBank {
  subject?: string | null;
  grade?: string | null;
  chapter?: string | null;
  focus_topic?: string | null;
  focus_percentage?: number | null;
  focus_questions?: number | null;
  language?: string | null;
  number_of_questions?: number | null;
  total_marks?: number | null;
  questions: GeneratedQuestion[];
  [key: string]: unknown;
}

export interface QuestionBankOutputResponse {
  output_path: string;
  metadata: QuestionBankMetadata;
  question_bank: GeneratedQuestionBank;
  provider_meta: Record<string, unknown>;
}

export interface QuestionBankListItem {
  metadata: QuestionBankMetadata;
  question_bank: GeneratedQuestionBank | null;
  has_output: boolean;
  last_modified?: string | null;
}

export interface QuestionBankListResponse {
  chapters: QuestionBankListItem[];
}

export interface DeleteQuestionBankResponse {
  deleted_keys: number;
}

/** Patch shape for the editable header on the Result page. */
export interface QuestionBankMetadataUpdate {
  subject?: string | null;
  grade?: string | null;
  chapter?: string | null;
  focus_topic?: string | null;
  focus_percentage?: number | null;
  focus_questions?: number | null;
  language?: string | null;
  number_of_questions?: number | null;
  total_marks?: number | null;
  extra_instructions?: string | null;
}

export interface DiagramUploadResponse {
  key: string;
  question_id?: string | null;
  content_type: string;
  size_bytes: number;
}

export interface QuestionBankUploadParams extends QuestionBankIdentity {
  files: File[];
  // Microservice contract fields.
  subject: string;
  grade: string;
  chapter: string;
  number_of_questions: number;
  total_marks: number;
  focus_topic?: string | null;
  focus_percentage?: number | null;
  focus_questions?: number | null;
  language?: string;
  extra_instructions?: string;
  onUploadProgress?: (event: { loaded: number; total?: number }) => void;
}

export interface QuestionSpec {
  type: QuestionType;
  difficulty: Difficulty;
  count: number;
}

export interface QuestionItem {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  marks: number;
  question: string;
  options: string[] | null;
  answer: string;
  explanation: string;
}

export interface GenerateRequest {
  topics: string;
  content?: string;
  subject?: string;
  specs: QuestionSpec[];
}

export interface GenerateResponse {
  questions: QuestionItem[];
  metadata: Record<string, unknown>;
}

export interface ParseFileResponse {
  content: string;
  filename: string;
  chars: number;
}

export interface ExportPDFRequest {
  questions: QuestionItem[];
  subject?: string;
  filename?: string;
  is_answer_key?: boolean;
}

export const questionBankApi = {
  parseFile: async (file: File): Promise<ParseFileResponse> => {
    const form = new FormData();
    form.append('file', file);
    const res = await client.post<ParseFileResponse>('question-bank/parse-file', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  generate: async (payload: GenerateRequest): Promise<GenerateResponse> => {
    const res = await client.post<GenerateResponse>('question-bank/generate', payload);
    return res.data;
  },

  exportPdf: async (payload: ExportPDFRequest): Promise<Blob> => {
    const res = await client.post('question-bank/export-pdf', payload, {
      responseType: 'blob',
    });
    return res.data as Blob;
  },
};

/**
 * S3 + external AI microservice flow.
 *
 * Mirrors `lessonPlanAIApi` in `@/features/lesson-plan/ai/api`. The
 * external microservice is shared between Lesson Plan and Question
 * Bank — same service, routed by ``type`` in the request body.
 */
export const questionBankAIApi = {
  /** SAVE — upload files + write metadata.json to S3. */
  upload: async (
    params: QuestionBankUploadParams,
  ): Promise<QuestionBankUploadResponse> => {
    const form = new FormData();
    form.append('school_id', params.school_id);
    form.append('teacher_id', params.teacher_id);
    form.append('grade_id', params.grade_id);
    form.append('subject_id', params.subject_id);
    form.append('chapter_id', params.chapter_id);
    form.append('subject', params.subject);
    form.append('grade', params.grade);
    form.append('chapter', params.chapter);
    form.append('number_of_questions', String(params.number_of_questions));
    form.append('total_marks', String(params.total_marks));
    form.append('language', params.language || 'English');
    form.append('extra_instructions', params.extra_instructions ?? '');
    if (params.focus_topic) form.append('focus_topic', params.focus_topic);
    if (
      typeof params.focus_percentage === 'number' &&
      !Number.isNaN(params.focus_percentage)
    ) {
      form.append('focus_percentage', String(params.focus_percentage));
    }
    if (
      typeof params.focus_questions === 'number' &&
      !Number.isNaN(params.focus_questions)
    ) {
      form.append('focus_questions', String(params.focus_questions));
    }
    for (const file of params.files) {
      form.append('files', file);
    }

    const res = await client.post('question-bank/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: params.onUploadProgress
        ? (e) => params.onUploadProgress!({ loaded: e.loaded, total: e.total })
        : undefined,
    });
    return res.data as QuestionBankUploadResponse;
  },

  /**
   * GENERATE — call the external AI microservice via the backend.
   *
   * Backend loads metadata.json from S3, posts it to the AI service
   * with ``type=question_bank``, waits for the service to write
   * output/question_bank.json to S3, then reads and returns the
   * result. May take up to several minutes.
   */
  generate: async (
    identity: QuestionBankIdentity,
  ): Promise<QuestionBankOutputResponse> => {
    const res = await client.post('question-bank/generate-s3', identity);
    return res.data as QuestionBankOutputResponse;
  },

  /**
   * FETCH OUTPUT — read output/question_bank.json directly from S3
   * without triggering generation. 404 if the external microservice
   * has not produced output yet.
   */
  fetchOutput: async (
    identity: QuestionBankIdentity,
  ): Promise<QuestionBankOutputResponse> => {
    const res = await client.get('question-bank/output', { params: identity });
    return res.data as QuestionBankOutputResponse;
  },

  /**
   * SAVE OUTPUT — overwrite output/question_bank.json with teacher edits.
   * Pass a non-null `metadata` to also patch the header fields in
   * metadata.json (subject, grade, chapter, focus_*, language, counts).
   */
  saveOutput: async (
    identity: QuestionBankIdentity,
    question_bank: GeneratedQuestionBank,
    metadata?: QuestionBankMetadataUpdate | null,
  ): Promise<QuestionBankOutputResponse> => {
    const res = await client.put('question-bank/output', {
      ...identity,
      question_bank,
      ...(metadata ? { metadata } : {}),
    });
    return res.data as QuestionBankOutputResponse;
  },

  /** Upload one diagram image and get back its S3 key. */
  uploadDiagram: async (
    identity: QuestionBankIdentity,
    file: File,
    questionId?: string | null,
  ): Promise<DiagramUploadResponse> => {
    const form = new FormData();
    form.append('school_id', identity.school_id);
    form.append('teacher_id', identity.teacher_id);
    form.append('grade_id', identity.grade_id);
    form.append('subject_id', identity.subject_id);
    form.append('chapter_id', identity.chapter_id);
    if (questionId) form.append('question_id', questionId);
    form.append('file', file);
    const res = await client.post('question-bank/diagram', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as DiagramUploadResponse;
  },

  /**
   * Build the URL that streams a stored diagram image via the backend.
   * Returns null when there's no key so callers can render conditionally
   * without sprinkling guards everywhere.
   */
  diagramUrl: (
    identity: QuestionBankIdentity,
    key?: string | null,
  ): string | null => {
    if (!key) return null;
    const params = new URLSearchParams({ ...identity, key });
    const base = (client.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/question-bank/diagram?${params.toString()}`;
  },

  /** LIST — every question bank the current teacher has saved. */
  listChapters: async (params: {
    school_id: string;
    teacher_id: string;
  }): Promise<QuestionBankListResponse> => {
    const res = await client.get('question-bank/chapters', { params });
    return res.data as QuestionBankListResponse;
  },

  /** DELETE — remove every S3 object under a question bank prefix. */
  deleteChapter: async (
    identity: QuestionBankIdentity,
  ): Promise<DeleteQuestionBankResponse> => {
    const res = await client.delete('question-bank/chapter', {
      params: identity,
    });
    return res.data as DeleteQuestionBankResponse;
  },
};
