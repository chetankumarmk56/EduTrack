import client from './client';
import type { AuthResponse, User } from '../types';

export const authApi = {
  login: async (credentials: any, institutionId: string) => {
    // Specialized login for portals
    const isTeacher = credentials.password && !credentials.dob && !credentials.username;
    const isStudent = !!credentials.dob;
    const isAdmin = !!credentials.username; // OAuth2 style for Admin
    
    let endpoint = 'auth/login';
    let data = credentials;
    let headers: Record<string, string> = { 'X-Institution-Id': institutionId };

    if (isTeacher) endpoint = 'directory/teachers/login';
    else if (isStudent) endpoint = 'directory/students/login';
    else if (isAdmin) {
      endpoint = 'auth/login';
      // Convert to form data for OAuth2
      const formData = new URLSearchParams();
      formData.append('username', credentials.username);
      formData.append('password', credentials.password);
      data = formData;
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await client.post<AuthResponse>(endpoint, data, { headers });
    return response.data;
  },

  getMe: async () => {
    const response = await client.get<User>('auth/me');
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await client.post<{ message: string }>('auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },
};
