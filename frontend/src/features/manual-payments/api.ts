import client from '@/shared/api/client';
import type {
  InstitutionPaymentSettings,
  InstitutionPaymentSettingsUpdate,
  ManualPaymentDecisionPayload,
  ManualPaymentListParams,
  ManualPaymentListResponse,
  ManualPaymentRequest,
  ManualPaymentStudentRef,
  SchoolPaymentInfo,
} from './types';

/**
 * API client for the manual payment workflow.
 *
 * Endpoints live under `/api/manual-payments`. The axios client already
 * scopes itself with the API base URL from `VITE_API_BASE_URL` so this
 * file uses relative paths.
 *
 * No data is shared with the legacy `features/finance/api.ts` — keeping
 * the two surfaces fully independent is part of the safety contract.
 */

const BASE = 'manual-payments';

export interface SubmitManualPaymentInput {
  student_id: number;
  parent_name: string;
  amount: number;
  transaction_reference: string;
  transaction_at: string; // ISO datetime
  fee_type?: string;
  installment_label?: string;
  payer_name?: string;
  payer_upi?: string;
  parent_note?: string;
  screenshot?: File | null;
}

export const manualPaymentsApi = {
  // ── Parent ────────────────────────────────────────────────────────────
  getSchoolInfo: async (): Promise<SchoolPaymentInfo> => {
    const { data } = await client.get<SchoolPaymentInfo>(`${BASE}/school-info`);
    return data;
  },

  getMyStudents: async (): Promise<ManualPaymentStudentRef[]> => {
    const { data } = await client.get<ManualPaymentStudentRef[]>(`${BASE}/students`);
    return data;
  },

  submit: async (input: SubmitManualPaymentInput): Promise<ManualPaymentRequest> => {
    const form = new FormData();
    form.append('student_id', String(input.student_id));
    form.append('parent_name', input.parent_name);
    form.append('amount', String(input.amount));
    form.append('transaction_reference', input.transaction_reference);
    form.append('transaction_at', input.transaction_at);
    if (input.fee_type) form.append('fee_type', input.fee_type);
    if (input.installment_label) form.append('installment_label', input.installment_label);
    if (input.payer_name) form.append('payer_name', input.payer_name);
    if (input.payer_upi) form.append('payer_upi', input.payer_upi);
    if (input.parent_note) form.append('parent_note', input.parent_note);
    if (input.screenshot) form.append('screenshot', input.screenshot);

    const { data } = await client.post<ManualPaymentRequest>(BASE, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  listMine: async (params?: { skip?: number; limit?: number }): Promise<ManualPaymentListResponse> => {
    const { data } = await client.get<ManualPaymentListResponse>(`${BASE}/mine`, { params });
    return data;
  },

  // ── Admin ─────────────────────────────────────────────────────────────
  list: async (params: ManualPaymentListParams = {}): Promise<ManualPaymentListResponse> => {
    const { data } = await client.get<ManualPaymentListResponse>(BASE, {
      params,
      paramsSerializer: {
        // FastAPI parses repeated `?status=PENDING_VERIFICATION&status=APPROVED`
        // when the param is a List[str]. Axios default would join with commas.
        indexes: null,
      },
    });
    return data;
  },

  get: async (id: number): Promise<ManualPaymentRequest> => {
    const { data } = await client.get<ManualPaymentRequest>(`${BASE}/${id}`);
    return data;
  },

  decide: async (
    id: number, payload: ManualPaymentDecisionPayload,
  ): Promise<ManualPaymentRequest> => {
    const { data } = await client.post<ManualPaymentRequest>(`${BASE}/${id}/decision`, payload);
    return data;
  },

  addNote: async (id: number, note: string): Promise<ManualPaymentRequest> => {
    const { data } = await client.post<ManualPaymentRequest>(`${BASE}/${id}/notes`, {
      admin_note: note,
    });
    return data;
  },

  receiptUrl: (id: number): string => {
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/').replace(/\/+$/, '');
    return `${base}/manual-payments/${id}/receipt`;
  },

  // ── Admin school-info settings (per institution) ──────────────────────
  getAdminSettings: async (): Promise<InstitutionPaymentSettings> => {
    const { data } = await client.get<InstitutionPaymentSettings>(`${BASE}/admin/school-info`);
    return data;
  },

  updateAdminSettings: async (
    payload: InstitutionPaymentSettingsUpdate,
  ): Promise<InstitutionPaymentSettings> => {
    const { data } = await client.put<InstitutionPaymentSettings>(`${BASE}/admin/school-info`, payload);
    return data;
  },

  uploadQr: async (file: File): Promise<InstitutionPaymentSettings> => {
    const form = new FormData();
    form.append('qr', file);
    const { data } = await client.post<InstitutionPaymentSettings>(
      `${BASE}/admin/school-info/qr`, form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  removeQr: async (): Promise<InstitutionPaymentSettings> => {
    const { data } = await client.delete<InstitutionPaymentSettings>(`${BASE}/admin/school-info/qr`);
    return data;
  },
};
