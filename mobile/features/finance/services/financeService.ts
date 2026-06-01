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
      const res = await apiClient.get('finance/my-dues');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return (res.data as StudentDues[]).map((r): ParentFee => {
        let overdue_days = 0;
        if (r.due_date) {
          const due = new Date(r.due_date);
          due.setHours(0, 0, 0, 0);
          overdue_days = Math.floor((today.getTime() - due.getTime()) / 86400000);
        }
        const total_paid = r.total_paid ?? 0;
        return {
          student_name: r.student_name,
          total_amount: total_paid + r.total_due,
          amount_paid: total_paid,
          due_amount: r.total_due,
          due_date: r.due_date ?? '',
          status: r.total_due <= 0 ? 'PAID' : total_paid > 0 ? 'PARTIAL' : 'UNPAID',
          overdue_days,
        };
      });
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
