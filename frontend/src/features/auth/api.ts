import client from '@/shared/api/client';
import { getCurrentPortalRole } from '@/shared/lib/portalRole';
import type { AuthResponse, User } from '@/shared/types';

export const authApi = {
  /**
   * Unified login dispatcher for all portals.
   *
   * `institutionId` is *optional* now. Teacher login no longer collects it —
   * the backend derives it from the user record after email+password verify.
   * Student/Parent and Admin flows still pass it because their identity
   * resolution depends on the tenant scope.
   */
  login: async (credentials: any, institutionId?: string) => {
    // Specialized login for portals
    const isTeacher = credentials.password && !credentials.dob && !credentials.username;
    const isStudent = !!credentials.dob;
    const isAdmin = !!credentials.username; // OAuth2 style for Admin

    let endpoint = 'auth/login';
    let data = credentials;
    const headers: Record<string, string> = {};

    if (institutionId) {
      // Persist with the role-suffixed key BEFORE the request — the axios
      // interceptor reads localStorage to populate X-Institution-Id, and
      // would otherwise clobber our explicit header with the stale default.
      const role = getCurrentPortalRole();
      localStorage.setItem(`edu_institution_id_${role}`, institutionId);
      headers['X-Institution-Id'] = institutionId;
    }

    if (isTeacher) {
      endpoint = 'directory/teachers/login';
      // Teacher login is tenant-agnostic at the door — the backend looks up
      // the user by email and derives institution_id from the User record.
      // The shared axios interceptor still injects X-Institution-Id from
      // localStorage on every request; the teacher endpoint ignores it.
    } else if (isStudent) {
      endpoint = 'directory/students/login';
    } else if (isAdmin) {
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

  /**
   * Parent-portal login using guardian phone + student DOB. The backend
   * derives institution_id from the matched student record after
   * authentication, so no Institution ID is required up front.
   */
  parentLogin: async (credentials: { parent_phone: string; dob: string }) => {
    // We intentionally don't set X-Institution-Id ourselves; the shared
    // axios interceptor adds a default value, which the backend ignores
    // on this route (institution_id comes off the student row).
    const response = await client.post<AuthResponse>('directory/parents/login', credentials);
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
