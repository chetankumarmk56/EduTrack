import client from '@/shared/api/client';

export type AccountDeletionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface AccountDeletionRequest {
  id: number;
  institution_id: number | null;
  user_id: number;
  requester_role: string;
  requester_name: string | null;
  requester_email: string | null;
  reason: string | null;
  status: AccountDeletionStatus;
  reviewed_by_user_id: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
}

interface MessageResponse {
  message: string;
  request: AccountDeletionRequest | null;
}

/**
 * Account-deletion request workflow. Self-service endpoints are available to any
 * authenticated user; the review endpoints are admin/super-admin only and are
 * scoped server-side (admins see their school's parent/student/teacher requests,
 * super-admins see admin requests). Paths are relative to the `/api/` baseURL.
 */
export const accountDeletionApi = {
  getMyRequest: async (): Promise<AccountDeletionRequest | null> => {
    const res = await client.get('account-deletion/requests/me');
    return (res.data as AccountDeletionRequest | null) ?? null;
  },

  createRequest: async (reason?: string): Promise<MessageResponse> => {
    const res = await client.post('account-deletion/requests', { reason: reason ?? null });
    return res.data as MessageResponse;
  },

  cancelMyRequest: async (): Promise<MessageResponse> => {
    const res = await client.post('account-deletion/requests/me/cancel');
    return res.data as MessageResponse;
  },

  listRequests: async (statusFilter: 'PENDING' | 'ALL' = 'PENDING'): Promise<AccountDeletionRequest[]> => {
    const res = await client.get('account-deletion/requests', { params: { status_filter: statusFilter } });
    return res.data as AccountDeletionRequest[];
  },

  approve: async (id: number, note?: string): Promise<MessageResponse> => {
    const res = await client.post(`account-deletion/requests/${id}/approve`, { note: note ?? null });
    return res.data as MessageResponse;
  },

  reject: async (id: number, note?: string): Promise<MessageResponse> => {
    const res = await client.post(`account-deletion/requests/${id}/reject`, { note: note ?? null });
    return res.data as MessageResponse;
  },
};
