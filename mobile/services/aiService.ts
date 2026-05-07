import apiClient from './apiClient';
import { AIQuestion } from '../types';

export const aiService = {
  generateQuestions: async (formData: FormData): Promise<{ questions: AIQuestion[] }> => {
    const res = await apiClient.post('ai/generate-questions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
