import apiClient from './apiClient';

export interface LoginPayload {
  // Student/Parent login (DOB-based)
  name?: string;
  class_level?: string;
  section?: string;
  dob?: string;
  role?: string;
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
   * Student / Parent login using DOB as password.
   */
  loginStudent: async (
    name: string,
    classLevel: string,
    section: string,
    dob: string,
    institutionId: string,
  ): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      'directory/students/login',
      { name, class_level: classLevel, section, dob, role: 'student' },
      { headers: { 'X-Institution-Id': institutionId } },
    );
    return response.data;
  },

  /**
   * Teacher login using email + password.
   */
  loginTeacher: async (
    email: string,
    password: string,
    institutionId: string,
  ): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      'directory/teachers/login',
      { email, password },
      { headers: { 'X-Institution-Id': institutionId } },
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
};
