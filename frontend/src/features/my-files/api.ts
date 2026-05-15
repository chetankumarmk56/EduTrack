import client from '@/shared/api/client';

export type ExtractionStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface UploadedFile {
  id: number;
  original_filename: string;
  mime_type: string;
  file_size: number;
  subject: string | null;
  category: string | null;
  tags: string[];
  uploaded_at: string;
  last_used_at: string | null;
  extraction_status: ExtractionStatus;
  has_text: boolean;
}

export interface UploadResultItem {
  filename: string;
  ok: boolean;
  file: UploadedFile | null;
  error: string | null;
}

export interface UploadResponse {
  accepted: UploadResultItem[];
  rejected: UploadResultItem[];
  summary: { received: number; accepted: number; rejected: number };
}

export interface FileListResponse {
  files: UploadedFile[];
  total: number;
}

export interface FileContentResponse {
  id: number;
  original_filename: string;
  extraction_status: ExtractionStatus;
  content: string;
  chars: number;
}

export interface UpdateMetadataPayload {
  subject?: string | null;
  category?: string | null;
  tags?: string[];
}

export const MAX_FILES_PER_REQUEST = 9;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

export const uploadedFilesApi = {
  upload: async (
    files: File[],
    opts: { subject?: string; category?: string; tags?: string[] } = {},
  ): Promise<UploadResponse> => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (opts.subject) form.append('subject', opts.subject);
    if (opts.category) form.append('category', opts.category);
    if (opts.tags?.length) form.append('tags', opts.tags.join(','));
    const res = await client.post<UploadResponse>('files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  list: async (params: {
    search?: string;
    subject?: string;
    tag?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<FileListResponse> => {
    const res = await client.get<FileListResponse>('files/my-files', { params });
    return res.data;
  },

  get: async (id: number): Promise<UploadedFile> => {
    const res = await client.get<UploadedFile>(`files/${id}`);
    return res.data;
  },

  getContent: async (id: number): Promise<FileContentResponse> => {
    const res = await client.get<FileContentResponse>(`files/${id}/content`);
    return res.data;
  },

  downloadBlob: async (id: number): Promise<Blob> => {
    const res = await client.get(`files/${id}/download`, { responseType: 'blob' });
    return res.data as Blob;
  },

  updateMetadata: async (
    id: number,
    patch: UpdateMetadataPayload,
  ): Promise<UploadedFile> => {
    const res = await client.patch<UploadedFile>(`files/${id}`, patch);
    return res.data;
  },

  remove: async (id: number): Promise<void> => {
    await client.delete(`files/${id}`);
  },
};
