import client from './client';
import type { DocumentResponse } from '../types';

export const documentsApi = {
  /**
   * Upload a file to the server (Teacher/Admin).
   */
  uploadDocument: async (file: File, category: string = 'general', studentId?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_category', category);
    if (studentId) {
      formData.append('student_id', studentId.toString());
    }

    const response = await client.post<DocumentResponse>('documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Fetch a list of documents based on criteria.
   */
  getDocuments: async (category?: string, studentId?: number) => {
    const params: any = {};
    if (category) params.category = category;
    if (studentId) params.student_id = studentId;

    const response = await client.get<DocumentResponse[]>('documents/', { params });
    return response.data;
  },

  /**
   * Delete a document entry and its physical storage.
   */
  deleteDocument: async (id: number) => {
    await client.delete(`documents/${id}`);
  },

  /**
   * Helper to fetch document as Blob for in-browser download.
   */
  downloadDocument: async (id: number, filename: string) => {
    const response = await client.get(`documents/${id}/download`, {
        responseType: 'blob'
    });
    
    // Create hidden anchor and download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};
