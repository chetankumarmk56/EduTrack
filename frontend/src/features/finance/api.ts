import client from '@/shared/api/client';

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
  // Unused — getMyDues() is used instead; nothing calls this in the frontend.
  // getStudentDues: async (studentId: number) => {
  //   const response = await client.get<StudentDuesResponse>(`finance/students/${studentId}/dues`);
  //   return response.data;
  // },

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

  // Unused — not called anywhere in the frontend (getLedger is used instead).
  // getAllPayments: async (params?: {
  //   mode?: string;
  //   status?: string;
  //   skip?: number;
  //   limit?: number;
  // }) => {
  //   const response = await client.get('finance/payments', { params });
  //   return response.data;
  // },

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
  },

  // --- Finance Ledger ---
  getLedger: async (params: LedgerListParams = {}) => {
    const response = await client.get<PaginatedLedgerResponse>('finance/ledger', { params });
    return response.data;
  },

  // Unused — not called anywhere in the frontend (summary is part of PaginatedLedgerResponse).
  // getLedgerSummary: async (params: { date_from?: string; date_to?: string; academic_year?: string } = {}) => {
  //   const response = await client.get<LedgerSummary>('finance/ledger/summary', { params });
  //   return response.data;
  // },

  exportLedger: async (params: LedgerExportParams) => {
    const response = await client.get('finance/ledger/export', {
      params,
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  getLedgerFilters: async () => {
    const response = await client.get<LedgerFilterOptions>('finance/ledger/filters');
    return response.data;
  },

  downloadLedgerReceipt: async (ledgerId: number): Promise<Blob> => {
    const response = await client.get(`finance/ledger/${ledgerId}/receipt`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};

// --- Ledger types ---

/**
 * The full set of payment states surfaced by the API. PROCESSING / EXPIRED /
 * PARTIALLY_REFUNDED are reserved for future gateway-state mappings — the
 * UI tolerates them throughout (badges, filters, sorting).
 */
export type LedgerPaymentStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'PROCESSING'
  | 'EXPIRED';

export interface LedgerEntry {
  id: number;
  receipt_number: string;
  entry_type: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
  payment_id: number | null;
  student_id: number;
  student_name: string;
  class_id: number | null;
  class_name: string | null;
  admission_number: string | null;
  fee_type: string | null;
  academic_year: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  amount: number;
  gateway_fee: number;
  net_amount: number;
  payment_method: string;
  payment_status: LedgerPaymentStatus | string;
  payment_date: string;
  notes: string | null;
  // Convenience: razorpay_payment_id or razorpay_order_id (or null for cash).
  transaction_id: string | null;
  // 'REFUNDED' / 'PARTIALLY_REFUNDED' / null
  refund_status: string | null;
  refunded_amount: number | null;
  // For FAILED / CANCELLED entries: the human-readable reason.
  error_message: string | null;
  // True when a PDF receipt can be downloaded for this entry.
  has_receipt: boolean;
  // Non-null when the ledger row was mirrored from a manual payment.
  manual_payment_request_id: number | null;
}

export interface LedgerSummary {
  total_collected: number;
  total_pending: number;
  total_failed: number;
  total_refunded: number;
  total_cancelled: number;
  net_revenue: number;
  transaction_count: number;
}

export interface PaginatedLedgerResponse {
  total: number;
  offset: number;
  limit: number;
  summary: LedgerSummary;
  items: LedgerEntry[];
}

export interface LedgerListParams {
  date_from?: string;       // YYYY-MM-DD
  date_to?: string;         // YYYY-MM-DD
  student_id?: number;
  class_id?: number;
  fee_type?: string;
  payment_status?: string;
  payment_method?: string;
  academic_year?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  skip?: number;
  limit?: number;
}

export interface LedgerExportParams {
  date_from: string;        // YYYY-MM-DD (required)
  date_to: string;          // YYYY-MM-DD (required)
  format: 'excel' | 'csv' | 'pdf';
  student_id?: number;
  class_id?: number;
  fee_type?: string;
  payment_status?: string;
  payment_method?: string;
  academic_year?: string;
}

export interface LedgerFilterOptions {
  statuses: string[];
  methods: string[];
  fee_types: string[];
  academic_years: string[];
  classes: {
    id: number;
    display_name: string;
    grade_id: number | null;
    section_id: number | null;
  }[];
  earliest_payment_date: string | null;
  latest_payment_date: string | null;
}

