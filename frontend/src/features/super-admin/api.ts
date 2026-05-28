import client from '@/shared/api/client';
import type { Institution } from '@/shared/types';

export interface InstitutionCreate {
  name: string;
  slug: string;
}

/** Row shape returned by GET /admin/admins. */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  institution_id?: number;
  institution_name?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface AdminCreate {
  name: string;
  email: string;
  password: string;
  // Backend defaults to 'admin' but the create endpoint accepts an
  // override (e.g. 'finance') so we expose it as optional here.
  role?: string;
}

export interface AdminUpdate {
  name?: string;
  email?: string;
  password?: string;
}

export const superAdminApi = {
  getInstitutions: async () => {
    const response = await client.get<Institution[]>('admin/institutions');
    return response.data;
  },

  createInstitution: async (data: InstitutionCreate) => {
    const response = await client.post<Institution>('admin/institutions', data);
    return response.data;
  },

  toggleInstitutionStatus: async (id: number, active: boolean) => {
    const action = active ? 'activate' : 'deactivate';
    const response = await client.post<Institution>(`admin/institutions/${id}/${action}`);
    return response.data;
  },

  updateInstitution: async (id: number, data: Partial<InstitutionCreate>) => {
    const response = await client.put<Institution>(`admin/institutions/${id}`, data);
    return response.data;
  },

  deleteInstitution: async (id: number) => {
    await client.delete(`admin/institutions/${id}`);
  },

  // --- Trash / Restore ---

  getTrashedInstitutions: async () => {
    const response = await client.get<Array<Institution & { deleted_at: string; days_until_purge: number }>>('admin/institutions/trash');
    return response.data;
  },

  restoreInstitution: async (id: number) => {
    const response = await client.post<Institution>(`admin/institutions/${id}/restore`);
    return response.data;
  },

  // --- Admin Credential Management ---
  
  getAdmins: async () => {
    const response = await client.get<AdminUser[]>('admin/admins');
    return response.data;
  },

  createAdmin: async (institutionId: number, data: AdminCreate) => {
    const response = await client.post<AdminUser>(`admin/institutions/${institutionId}/admins`, data);
    return response.data;
  },

  updateAdmin: async (id: number, data: AdminUpdate) => {
    const response = await client.put<AdminUser>(`admin/admins/${id}`, data);
    return response.data;
  },

  deleteAdmin: async (id: number) => {
    await client.delete(`admin/admins/${id}`);
  }
};
