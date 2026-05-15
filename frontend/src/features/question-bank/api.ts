import client from '@/shared/api/client';

export type QuestionType = 'mcq' | 'short' | 'long';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

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
