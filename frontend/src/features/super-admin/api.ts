import client from '@/shared/api/client';
import type { Institution } from '@/shared/types';

export interface InstitutionCreate {
  name: string;
  slug: string;
  /** Optional school logo. PNG/JPG/JPEG/WEBP, max 5 MB. */
  logo?: File | null;
}

/**
 * Shape for PATCH-ing a school.
 * - Omit `logo` and `removeLogo` to leave the current logo alone.
 * - Set `logo` to a File to replace it.
 * - Set `removeLogo: true` (without `logo`) to clear it back to null.
 */
export interface InstitutionUpdate {
  name?: string;
  slug?: string;
  is_active?: boolean;
  logo?: File | null;
  removeLogo?: boolean;
}

/** Image MIME types accepted by the backend for the school logo. */
export const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
/** File-extension allowlist mirrored from the backend. */
export const LOGO_ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
/** Max logo size in bytes (5 MB) — kept in sync with admin_service.LOGO_MAX_SIZE. */
export const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

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
    // The endpoint is multipart so an optional logo file can be sent in
    // the same request as the name/slug. Server-side, the field name
    // "logo" is what FastAPI binds the UploadFile to.
    const form = new FormData();
    form.append('name', data.name);
    form.append('slug', data.slug);
    if (data.logo) form.append('logo', data.logo);
    const response = await client.post<Institution>('admin/institutions', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  toggleInstitutionStatus: async (id: number, active: boolean) => {
    const action = active ? 'activate' : 'deactivate';
    const response = await client.post<Institution>(`admin/institutions/${id}/${action}`);
    return response.data;
  },

  updateInstitution: async (id: number, data: InstitutionUpdate) => {
    // Multipart so the same call can carry a logo replacement / removal
    // alongside scalar field edits — keeps the UI's single "Save" button
    // semantically atomic.
    const form = new FormData();
    if (data.name !== undefined) form.append('name', data.name);
    if (data.slug !== undefined) form.append('slug', data.slug);
    if (data.is_active !== undefined) form.append('is_active', String(data.is_active));
    if (data.logo) form.append('logo', data.logo);
    if (data.removeLogo) form.append('remove_logo', 'true');
    const response = await client.put<Institution>(`admin/institutions/${id}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
