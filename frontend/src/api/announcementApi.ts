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

export const announcementApi = {
  getTeacherAnnouncements: (teacherId: number) => 
    client.get(`/announcements/teacher/${teacherId}`).then(res => res.data),
    
  getMyAnnouncements: () => 
    client.get('/announcements/my').then(res => res.data),
    
  getParentAnnouncements: (parentId: number) => 
    client.get(`/announcements/parent/${parentId}`).then(res => res.data),
    
  createAnnouncement: (data: AnnouncementCreate) => 
    client.post('/announcements', data).then(res => res.data),
    
  markAsRead: (announcementId: string, parentId: number) => 
    client.post('/announcements/read', { announcement_id: announcementId, parent_id: parentId }).then(res => res.data),
    
  deleteAnnouncement: (id: string) => 
    client.delete(`/announcements/${id}`).then(res => res.data),

  uploadAttachment: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await client.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data as { url: string };
  },
  
  getAttachmentUrl: (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/').replace('/api/', '');
    return `${base}${path}`;
  }
};
