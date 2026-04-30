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
  total_paid: number;
  due_date: string | null;   // ISO date string
  is_overdue: boolean;
  breakdown: CategoryWiseDue[];
}

export interface ClassFinanceRow {
  class_id: number;
  class_name: string;
  fee_per_student: number;
  total_students: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
  no_record_count: number;
  total_expected: number;
  total_collected: number;
  total_pending: number;
}

export interface ClassFinanceBreakdownResponse {
  rows: ClassFinanceRow[];
  grand_total_expected: number;
  grand_total_collected: number;
  grand_total_pending: number;
  total_classes_with_fee: number;
  total_students: number;
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
  phone?: string;
  class_id?: number;
  grade_id?: number;
}

export interface OrderResponse {
  order_id: string;
  amount: number;
  key_id: string;
  currency: string;
  is_mock?: boolean;
}

export interface PaymentDetails {
  id: number;
  student_id: number;
  student_name?: string;
  amount: number;
  status: string;
  payment_mode: string;
  created_at: string;
  razorpay_order_id?: string;
  note?: string;
}

export const financeApi = {
  // Auto-resolved dues for logged-in parent/student (no ID needed)
  getMyDues: async (): Promise<StudentDuesResponse[]> => {
    const response = await client.get<StudentDuesResponse[]>('finance/my-dues');
    return response.data;
  },

  // Parent Methods
  getStudentDues: async (studentId: number) => {
    const response = await client.get<StudentDuesResponse>(`finance/students/${studentId}/dues`);
    return response.data;
  },

  getParentFees: async () => {
    const response = await client.get<any[]>('parent/fees');
    return response.data;
  },

  getStudentPayments: async (studentId: number) => {
    const response = await client.get<any[]>(`finance/payments/student/${studentId}`);
    return response.data;
  },

  createOrder: async (studentId: number, amount: number): Promise<OrderResponse> => {
    const response = await client.post<OrderResponse>('finance/payments/create-order', {
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

  cancelPayment: async (data: {
    razorpay_order_id: string;
    student_id: number;
  }) => {
    const response = await client.post('finance/payments/cancel', data);
    return response.data;
  },

  // Admin/Finance Methods
  getSummary: async () => {
    const response = await client.get<FinanceSummaryResponse>('finance/summary');
    return response.data;
  },

  getClassBreakdown: async () => {
    const response = await client.get<ClassFinanceBreakdownResponse>('finance/class-breakdown');
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
  },

  backfillFees: async () => {
    const response = await client.post<{
      status: string;
      message: string;
      created: number;
      updated: number;
      skipped: number;
    }>('finance/backfill-fees');
    return response.data;
  }
};

