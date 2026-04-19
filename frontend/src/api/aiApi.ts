import client from './client';
import type { DocumentResponse } from '../types';

export const aiApi = {
  /**
   * Analyze curriculum context for lesson planning.
   */
  analyzeCurriculum: async (data: FormData) => {
    const response = await client.post('ai/analyze', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  /**
   * Generate structured assessment questions based on topic/document.
   */
  generateQuestions: async (data: FormData) => {
    const response = await client.post('ai/generate-questions', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  /**
   * Download a generated PowerPoint presentation.
   */
  downloadPpt: async (data: any) => {
    const response = await client.post('ai/download-ppt', data, {
      responseType: 'blob'
    });
    return response.data;
  },

  /**
   * Download a generated Question Bank PDF.
   */
  downloadPdf: async (data: any) => {
    const response = await client.post('ai/download-pdf', data, {
      responseType: 'blob'
    });
    return response.data;
  },

  /**
   * List documents already indexed for AI processing.
   */
  getIndexedDocuments: async () => {
    const response = await client.get<DocumentResponse[]>('ai/indexed-documents');
    return response.data;
  }
};
