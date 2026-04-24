import client from './client';

export interface CategoryWiseDue {
  fee_type: string;
  total: number;
  paid: number;
  due: number;
}

export interface StudentDuesResponse {
  student_id: number;
  student_name: string;
  total_due: number;
  breakdown: CategoryWiseDue[];
}

export interface PaymentDetails {
  id: number;
  student_id: number;
  amount: number;
  status: string;
  payment_mode: string;
  created_at: string;
  razorpay_order_id?: string;
  note?: string;
}

export interface FinanceSummaryResponse {
  total_collected: number;
  total_pending: number;
  category_collected: { category: string; amount: number }[];
  category_pending: { category: string; amount: number }[];
}

export interface DefaulterResponse {
  student_id: number;
  student_name: string;
  total_due: number;
  class_name: string;
}

export const financeApi = {
  // Parent Methods
  getStudentDues: async (studentId: number) => {
    const response = await client.get<StudentDuesResponse>(`finance/students/${studentId}/dues`);
    return response.data;
  },

  getParentFees: async () => {
    const response = await client.get<any[]>('parent/fees');
    return response.data;
  },

  createOrder: async (studentId: number, amount: number) => {
    const response = await client.post('finance/payments/create-order', {
      student_id: studentId,
      amount
    });
    return response.data;
  },

  verifyPayment: async (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    const response = await client.post('finance/payments/verify', data);
    return response.data;
  },

  // Admin/Finance Methods
  getSummary: async () => {
    const response = await client.get<FinanceSummaryResponse>('finance/summary');
    return response.data;
  },

  getAllPayments: async (params?: {
    mode?: string;
    status?: string;
    skip?: number;
    limit?: number;
  }) => {
    const response = await client.get('finance/payments', { params });
    return response.data;
  },

  getDefaulters: async () => {
    const response = await client.get<DefaulterResponse[]>('finance/defaulters');
    return response.data;
  },

  recordManualPayment: async (data: {
    student_id: number;
    amount: number;
    mode: string;
    note?: string;
  }) => {
    const response = await client.post('finance/payments/manual', data);
    return response.data;
  }
};
