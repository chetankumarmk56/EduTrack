import client from '@/shared/api/client';
import type { ParentFeeItem } from '@/shared/types';

export interface PaymentRecord {
  id: number;
  student_id: number;
  amount: number;
  status: string;
  source?: string;
  fee_type?: string | null;
  note?: string | null;
  paid_at?: string | null;
  created_at: string;
  payment_mode?: string | null;
}

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

export interface PaymentDetails {
  id: number;
  student_id: number;
  student_name?: string;
  amount: number;
  status: string;
  payment_mode: string;
  created_at: string;
  note?: string;
}

export const financeApi = {
  // Auto-resolved dues for logged-in parent/student (no ID needed)
  getMyDues: async (): Promise<StudentDuesResponse[]> => {
    const response = await client.get<StudentDuesResponse[]>('finance/my-dues');
    return response.data;
  },

  getParentFees: async (): Promise<ParentFeeItem[]> => {
    const response = await client.get<StudentDuesResponse[]>('finance/my-dues');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return response.data.map((r): ParentFeeItem => {
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
        due_date: r.due_date,
        status: r.total_due <= 0 ? 'PAID' : total_paid > 0 ? 'PARTIAL' : 'UNPAID',
        overdue_days,
      };
    });
  },

  getStudentPayments: async (studentId: number) => {
    const response = await client.get<PaymentRecord[]>(`finance/payments/student/${studentId}`);
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

  // --- Fee reminders ---
  getFeeReminderSettings: async (): Promise<FeeReminderSettings> => {
    const { data } = await client.get<FeeReminderSettings>('finance/fee-reminders/settings');
    return data;
  },

  updateFeeReminderSettings: async (
    payload: FeeReminderSettingsUpdate,
  ): Promise<FeeReminderSettings> => {
    const { data } = await client.put<FeeReminderSettings>(
      'finance/fee-reminders/settings', payload,
    );
    return data;
  },

  previewFeeReminders: async (): Promise<FeeReminderPreview> => {
    const { data } = await client.get<FeeReminderPreview>('finance/fee-reminders/preview');
    return data;
  },

  dispatchFeeReminders: async (
    opts: { dry_run?: boolean } = {},
  ): Promise<FeeReminderDispatchSummary> => {
    const { data } = await client.post<FeeReminderDispatchSummary>(
      'finance/fee-reminders/dispatch',
      undefined,
      { params: opts.dry_run ? { dry_run: true } : undefined },
    );
    return data;
  },
};

// --- Ledger types ---

export type LedgerPaymentStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

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
  amount: number;
  gateway_fee: number;
  net_amount: number;
  payment_method: string;
  payment_status: LedgerPaymentStatus | string;
  payment_date: string;
  notes: string | null;
  // External reference: UTR for UPI, internal id for cash; null otherwise.
  transaction_id: string | null;
  refund_status: string | null;
  refunded_amount: number | null;
  error_message: string | null;
  has_receipt: boolean;
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
  date_from?: string;
  date_to?: string;
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
  date_from: string;
  date_to: string;
  format: 'excel' | 'csv' | 'pdf';
  student_id?: number;
  class_id?: number;
  fee_type?: string;
  payment_status?: string;
  payment_method?: string;
  academic_year?: string;
}

// --- Fee-reminder types ---

export type FeeReminderAutomationMode = 'DISABLED' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface FeeReminderSettings {
  institution_id: number;
  automation_mode: FeeReminderAutomationMode;
  day_of_week: number | null;   // 0..6 (Mon..Sun) for WEEKLY
  day_of_month: number | null;  // 1..28 for MONTHLY
  send_hour: number;            // 0..23
  timezone: string;
  overdue_days: number | null;
  cooldown_days: number | null;
  voice_calls_enabled: boolean;
  last_run_at: string | null;
  last_run_triggered_by: string | null;
  effective_overdue_days: number;
  effective_cooldown_days: number;
}

export interface FeeReminderSettingsUpdate {
  automation_mode?: FeeReminderAutomationMode;
  day_of_week?: number | null;
  day_of_month?: number | null;
  send_hour?: number;
  timezone?: string;
  overdue_days?: number | null;
  cooldown_days?: number | null;
  voice_calls_enabled?: boolean;
}

export interface FeeReminderEligibleRow {
  student_fee_id: number;
  student_id: number;
  student_name: string;
  class_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  due_amount: number;
  due_date: string;
  days_overdue: number;
  last_notified_at: string | null;
  has_login_target: boolean;
  has_phone: boolean;
  in_cooldown: boolean;
  eligible_now: boolean;
  skip_reason: string | null;
}

export interface FeeReminderPreview {
  overdue_count: number;
  overdue_unique_students: number;
  overdue_total_due: number;
  eligible_count: number;
  unique_students: number;
  total_due_amount: number;
  in_cooldown_count: number;
  no_login_count: number;
  rows: FeeReminderEligibleRow[];
}

export interface FeeReminderDispatchSummary {
  triggered: boolean;
  skipped_reason: string | null;
  eligible_rows: number;
  unique_students: number;
  skipped_no_target: number;
  /** Attempted but not reached (no push token + no call). Not cooled down. */
  delivery_failed: number;
  push: { sent?: number; failed?: number; tokens?: number; invalidated?: number };
  calls: { placed?: number; failed?: number; skipped_no_phone?: number };
  notified_fee_ids: number[];
  first_call_error: string | null;
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
