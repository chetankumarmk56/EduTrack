import apiClient from '@/shared/services/apiClient';

export interface LoginPayload {
  // Parent login (guardian phone + student DOB)
  parent_phone?: string;
  dob?: string;
  // Teacher login
  email?: string;
  password?: string;
  // Admin login (OAuth2)
  username?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: 'parent' | 'student' | 'teacher' | 'admin' | 'super_admin';
  institution_id: number;
  user: {
    id: number;
    name: string;
    email?: string;
    role: string;
    institution_id?: number;
    [key: string]: any;
  };
}

export const authService = {
  /**
   * Parent-portal login.
   *
   * Credentials are the guardian phone the admin recorded against the
   * student during enrollment + the student's DOB. The backend looks up
   * the student by (parent_phone, dob), derives institution_id from the
   * matched row, and embeds it in the JWT. No institution code is sent
   * from the client.
   */
  loginParent: async (
    parentPhone: string,
    dob: string,
  ): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      'directory/parents/login',
      { parent_phone: parentPhone, dob },
    );
    return response.data;
  },

  /**
   * Teacher login using email + password only.
   *
   * institution_id is intentionally not sent — the backend resolves it
   * from the User record after authenticating, and ships it back on the
   * response body so the mobile app can store it for downstream API calls
   * that still rely on per-tenant filtering / X-Institution-Id headers.
   */
  loginTeacher: async (
    email: string,
    password: string,
  ): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      'directory/teachers/login',
      { email, password },
    );
    return response.data;
  },

  /**
   * Get current authenticated user profile.
   */
  getMe: async () => {
    const response = await apiClient.get('auth/me');
    return response.data;
  },

  /**
   * Change the authenticated user's password.
   */
  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post('auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};
