import client from './client';

export interface AnnouncementCreate {
  title: string;
  message: string;
  type: 'class' | 'student';
  priority: 'low' | 'medium' | 'high';
  class_id?: number;
  student_id?: number;
  attachment_url?: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'class' | 'student';
  priority: 'low' | 'medium' | 'high';
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
}

export const announcementApi = {
  getTeacherAnnouncements: (teacherId: number): Promise<Announcement[]> =>
    client.get(`/announcements/teacher/${teacherId}`).then(res => res.data),

  getMyAnnouncements: (): Promise<Announcement[]> =>
    client.get('/announcements/my').then(res => res.data),

  getParentAnnouncements: (parentId: number): Promise<Announcement[]> =>
    client.get(`/announcements/parent/${parentId}`).then(res => res.data),

  createAnnouncement: (data: AnnouncementCreate): Promise<Announcement> =>
    client.post('/announcements', data).then(res => res.data),

  markAsRead: (announcementId: string, parentId: number) =>
    client.post('/announcements/read', {
      announcement_id: announcementId,
      parent_id: parentId,
    }).then(res => res.data),

  deleteAnnouncement: (id: string) =>
    client.delete(`/announcements/${id}`).then(res => res.data),

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
};
