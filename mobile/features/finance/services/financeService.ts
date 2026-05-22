import apiClient from '@/shared/services/apiClient';
import { StudentDues, ParentFee, Payment } from '@/shared/types';

export const financeService = {
  getStudentDues: async (studentId: number): Promise<StudentDues> => {
    // console.log('[financeService] Fetching student dues:', studentId);
    try {
      const res = await apiClient.get(`finance/students/${studentId}/dues`);
      // console.log('[financeService] Dues fetched:', res.data);
      return res.data;
    } catch (error) {
      console.error('[financeService] Failed to fetch dues:', error);
      throw error;
    }
  },

  getParentFees: async (): Promise<ParentFee[]> => {
    // console.log('[financeService] Fetching parent fees');
    try {
      const res = await apiClient.get('parent/fees');
      // console.log('[financeService] Fees fetched. Count:', res.data?.length || 0);
      return res.data;
    } catch (error) {
      console.error('[financeService] Failed to fetch fees:', error);
      throw error;
    }
  },

  createOrder: async (studentId: number, amount: number) => {
    const res = await apiClient.post('finance/payments/create-order', { student_id: studentId, amount });
    return res.data;
  },

  verifyPayment: async (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    const res = await apiClient.post('finance/payments/verify', data);
    return res.data;
  },

  cancelOrder: async (studentId: number, razorpayOrderId: string) => {
    try {
      await apiClient.post('finance/payments/cancel', {
        razorpay_order_id: razorpayOrderId,
        student_id: studentId,
      });
    } catch {
      // best-effort — don't surface cancel errors to user
    }
  },

  getFees: async (studentId: number): Promise<Payment[]> => {
    // console.log('[financeService] Fetching fees for student:', studentId);
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
