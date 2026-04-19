import client from './client';
import type { Institution } from '../types';

export interface InstitutionCreate {
  name: string;
  slug: string;
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

  // --- Admin Credential Management ---
  
  getAdmins: async () => {
    const response = await client.get<any[]>('admin/admins');
    return response.data;
  },

  createAdmin: async (institutionId: number, data: any) => {
    const response = await client.post<any>(`admin/institutions/${institutionId}/admins`, data);
    return response.data;
  },

  updateAdmin: async (id: number, data: any) => {
    const response = await client.put<any>(`admin/admins/${id}`, data);
    return response.data;
  },

  deleteAdmin: async (id: number) => {
    await client.delete(`admin/admins/${id}`);
  }
};
