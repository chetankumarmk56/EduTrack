import apiClient from '@/shared/services/apiClient';
import { Announcement } from '@/shared/types';

export const announcementService = {
  getMyAnnouncements: async (): Promise<Announcement[]> => {
    const res = await apiClient.get('/announcements/my');
    return res.data;
  },

  getAttachmentUrl: (path: string, baseUrl: string): string => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = baseUrl.replace(/\/api\/?$/, '');
    return `${base}${path}`;
  },

  getAttachmentType: (url: string): 'image' | 'pdf' | 'doc' | 'video' | 'other' => {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(lower)) return 'image';
    if (/\.pdf/.test(lower)) return 'pdf';
    if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf)/.test(lower)) return 'doc';
    if (/\.(mp4|mov|avi|mp3|m4a)/.test(lower)) return 'video';
    if (lower.includes('/image/upload/')) return 'image';
    if (lower.includes('/video/upload/')) return 'video';
    if (lower.includes('/raw/upload/')) return 'doc';
    return 'other';
  },

  /**
   * Post a new announcement (Teacher only)
   */
  createAnnouncement: async (data: any) => {
    const res = await apiClient.post('/announcements/', data);
    return res.data;
  },

  /**
   * Mark an announcement as read for the current parent/student.
   * Backend auto-resolves parent_id from the auth token when omitted.
   */
  markAsRead: async (announcementId: string | number) => {
    try {
      await apiClient.post('/announcements/read', { announcement_id: announcementId });
    } catch (e) {
      // best-effort — don't break the UI if the read receipt fails
      console.warn('[announcementService] markAsRead failed', e);
    }
  },
};
