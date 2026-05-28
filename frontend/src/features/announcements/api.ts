import client from '@/shared/api/client';
import type { AnnouncementCategory } from './constants';

export interface HomeworkChildStatus {
  student_id: number;
  student_name?: string;
  confirmed: boolean;
  confirmed_at?: string | null;
  confirmed_by_parent_id?: number | null;
}

export interface AnnouncementCreate {
  title: string;
  message: string;
  type: 'CLASS' | 'STUDENT';
  priority: 'NORMAL' | 'IMPORTANT';
  category?: AnnouncementCategory;

  class_id?: number;
  student_id?: number;
  attachment_url?: string;

  // Homework-only fields (ignored by backend when category !== HOMEWORK).
  due_date?: string | null;
  subject?: string | null;
  instructions?: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'CLASS' | 'STUDENT';
  priority: 'NORMAL' | 'IMPORTANT';
  category?: AnnouncementCategory;

  class_id?: number;
  student_id?: number;
  attachment_url?: string;
  teacher_id: number;
  teacher_name?: string;
  institution_id: number;
  created_at: string;
  is_read?: boolean;
  read_count?: number;
  target_count?: number;

  // Homework metadata
  due_date?: string | null;
  subject?: string | null;
  instructions?: string | null;
  homework_confirmed_count?: number;
  homework_target_count?: number;
  /** Per-child status for the current viewer (parent feed only). */
  homework_my_children?: HomeworkChildStatus[];
}

export interface HomeworkConfirmation {
  id: string;
  announcement_id: string;
  student_id: number;
  parent_id?: number | null;
  confirmed_at: string;
  student_name?: string;
  parent_name?: string;
}

export interface HomeworkPendingStudent {
  student_id: number;
  student_name?: string;
}

export interface HomeworkConfirmationsBreakdown {
  confirmed: HomeworkConfirmation[];
  pending: HomeworkPendingStudent[];
}

export const announcementApi = {
  getTeacherAnnouncements: (teacherId: number): Promise<Announcement[]> =>
    client.get(`/announcements/teacher/${teacherId}`).then(res => res.data),

  getMyAnnouncements: (): Promise<Announcement[]> =>
    client.get('/announcements/my').then(res => res.data),

  getParentAnnouncements: (parentId: number): Promise<Announcement[]> =>
    client.get(`/announcements/parent/${parentId}`).then(res => res.data),

  createAnnouncement: (data: AnnouncementCreate): Promise<Announcement> =>
    // Trailing slash matches the backend route exactly. Without it FastAPI
    // 307s to the slashed URL, and browsers null out Origin on cross-site
    // POST redirects — that drops CORS headers and surfaces as a 500/CORS
    // error in the console.
    client.post('/announcements/', data).then(res => res.data),

  markAsRead: (announcementId: string, parentId?: number) =>
    client.post('/announcements/read', {
      announcement_id: announcementId,
      parent_id: parentId,
    }).then(res => res.data),

  deleteAnnouncement: (id: string) =>
    client.delete(`/announcements/${id}`).then(res => res.data),

  /** Parent confirms homework completion for one child. Idempotent. */
  confirmHomework: (announcementId: string, studentId: number): Promise<HomeworkConfirmation> =>
    client
      .post(`/announcements/${announcementId}/homework/confirm`, { student_id: studentId })
      .then(res => res.data),

  /** Teacher view: who has confirmed this homework, and who is still pending. */
  listHomeworkConfirmations: (announcementId: string): Promise<HomeworkConfirmationsBreakdown> =>
    client
      .get(`/announcements/${announcementId}/homework/confirmations`)
      .then(res => res.data),

  uploadAttachment: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data as { url: string };
  },

  /** Resolve an attachment path/URL to a full viewable URL */
  getAttachmentUrl: (path: string): string => {
    if (!path) return '';
    // Cloudinary, Azure, or any full URL — return as-is
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    // Local fallback (relative path like /static/uploads/...)
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api')
      .replace(/\/api\/?$/, '');
    return `${base}${path}`;
  },

  /** Detect attachment type from URL for display purposes */
  getAttachmentType: (url: string): 'image' | 'pdf' | 'doc' | 'video' | 'other' => {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(lower)) return 'image';
    if (/\.pdf/.test(lower)) return 'pdf';
    if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf)/.test(lower)) return 'doc';
    if (/\.(mp4|mov|avi|mp3|m4a)/.test(lower)) return 'video';
    // Cloudinary URLs without extension — check resource_type in URL
    if (lower.includes('/image/upload/')) return 'image';
    if (lower.includes('/video/upload/')) return 'video';
    if (lower.includes('/raw/upload/')) return 'doc';
    return 'other';
  },

  /**
   * Generate a force-download URL via the backend /api/announcements/download endpoint.
   * The backend serves the file with Content-Disposition: attachment, guaranteeing
   * a Save dialog instead of opening in a new tab.
   */
  getDownloadUrl: (path: string): string => {
    if (!path) return '';
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api')
      .replace(/\/api\/?$/, '');
    // Build the full file URL to pass to the backend
    const fullPath = (path.startsWith('http://') || path.startsWith('https://'))
      ? path
      : `${base}${path}`;
    return `${base}/api/announcements/download?file_path=${encodeURIComponent(fullPath)}`;
  },
};
