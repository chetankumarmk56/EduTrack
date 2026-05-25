/**
 * Shared types for the manual-payment (parallel) workflow.
 *
 * Kept in a single file so the parent and admin UIs reference the same
 * status values and shapes. Do not import from `features/finance/api.ts`
 * here — the new flow is intentionally isolated from the legacy gateway
 * flow.
 */

export const MANUAL_PAYMENT_STATUSES = [
  'PENDING_VERIFICATION',
  'APPROVED',
  'NEED_VERIFICATION',
  'REJECTED',
  'FAILED',
  'PARTIAL_PAYMENT',
] as const;

export type ManualPaymentStatus = (typeof MANUAL_PAYMENT_STATUSES)[number];

export interface ManualPaymentAuditLog {
  id: number;
  event: string;
  actor_user_id?: number | null;
  actor_role?: string | null;
  actor_name?: string | null;
  message?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  created_at: string;
}

export interface ManualPaymentRequest {
  id: number;
  institution_id: number;

  student_id: number;
  student_name: string;
  parent_name: string;
  class_name?: string | null;
  section_name?: string | null;

  fee_type?: string | null;
  installment_label?: string | null;

  amount: number;
  approved_amount?: number | null;

  transaction_reference: string;
  transaction_at: string;
  payer_name?: string | null;
  payer_upi?: string | null;
  screenshot_url?: string | null;
  parent_note?: string | null;

  status: ManualPaymentStatus | string;
  admin_note?: string | null;
  rejection_reason?: string | null;

  reviewed_by_user_id?: number | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  first_viewed_at?: string | null;

  receipt_number?: string | null;
  receipt_url?: string | null;
  receipt_generated_at?: string | null;

  submitted_at: string;
  submitted_by_user_id: number;

  audit_logs: ManualPaymentAuditLog[];
}

export interface ManualPaymentSummary {
  total: number;
  pending_verification: number;
  approved: number;
  need_verification: number;
  rejected: number;
  failed: number;
  partial: number;
  total_approved_amount: number;
}

export interface ManualPaymentListResponse {
  total: number;
  offset: number;
  limit: number;
  summary: ManualPaymentSummary;
  items: ManualPaymentRequest[];
}

export interface SchoolPaymentInfo {
  school_name: string;
  upi_id?: string | null;
  upi_display_name?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_account_holder?: string | null;
  qr_image_url?: string | null;
  payment_instructions?: string | null;
  is_configured?: boolean;
}

export interface InstitutionPaymentSettings extends SchoolPaymentInfo {
  updated_at?: string | null;
  updated_by_name?: string | null;
}

export interface InstitutionPaymentSettingsUpdate {
  upi_id?: string | null;
  upi_display_name?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_account_holder?: string | null;
  payment_instructions?: string | null;
}

export interface ManualPaymentStudentRef {
  id: number;
  name: string;
  school_class_id: number | null;
}

export interface ManualPaymentListParams {
  status?: ManualPaymentStatus[];
  student_id?: number;
  class_name?: string;
  min_amount?: number;
  max_amount?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  order?: 'asc' | 'desc';
  skip?: number;
  limit?: number;
}

export interface ManualPaymentDecisionPayload {
  decision: ManualPaymentStatus;
  approved_amount?: number;
  rejection_reason?: string;
  admin_note?: string;
}

export const STATUS_LABEL: Record<ManualPaymentStatus, string> = {
  PENDING_VERIFICATION: 'Pending Verification',
  APPROVED: 'Approved',
  NEED_VERIFICATION: 'Need Verification',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
  PARTIAL_PAYMENT: 'Partial Payment',
};
