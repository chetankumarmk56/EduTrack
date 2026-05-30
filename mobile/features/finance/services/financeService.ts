import apiClient from '@/shared/services/apiClient';
import { StudentDues, ParentFee, Payment } from '@/shared/types';

export const financeService = {
  getStudentDues: async (studentId: number): Promise<StudentDues> => {
    try {
      const res = await apiClient.get(`finance/students/${studentId}/dues`);
      return res.data;
    } catch (error) {
      console.error('[financeService] Failed to fetch dues:', error);
      throw error;
    }
  },

  getParentFees: async (): Promise<ParentFee[]> => {
    try {
      const res = await apiClient.get('parent/fees');
      return res.data;
    } catch (error) {
      console.error('[financeService] Failed to fetch fees:', error);
      throw error;
    }
  },

  getFees: async (studentId: number): Promise<Payment[]> => {
    const res = await apiClient.get(`finance/students/${studentId}/dues`);
    const breakdown: any[] = res.data?.breakdown ?? [];
    return breakdown.map((item: any, index: number) => ({
      id: index,
      student_id: studentId,
      amount: item.due ?? 0,
      fee_type: item.fee_type ?? 'Fee',
      total_amount: item.total ?? 0,
      paid_amount: item.paid ?? 0,
      due_amount: item.due ?? 0,
      status: (item.due ?? 0) > 0 ? 'pending' : 'paid',
      due_date: '',
    }));
  },
};
