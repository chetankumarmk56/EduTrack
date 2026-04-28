import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, STORAGE_KEYS } from '../constants';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor ──────────────────────────────────────────────────────
// Injects auth token, institution ID, and portal role.
// IMPORTANT: Only sets a header if it hasn't already been set by the call-site.
// This lets login/auth calls explicitly pass their own X-Institution-Id without
// it being overwritten by a stale value from SecureStore.
apiClient.interceptors.request.use(
  async (config) => {
    const [token, storedInstitutionId, storedRole] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.getItemAsync(STORAGE_KEYS.INSTITUTION_ID),
      SecureStore.getItemAsync(STORAGE_KEYS.ROLE),
    ]);

    // Always inject the latest token (login endpoints will ignore it server-side)
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Only set institution/role from SecureStore if NOT already set by the caller.
    // This is critical for login: the user-typed institution code must win.
    if (storedInstitutionId && !config.headers['X-Institution-Id']) {
      config.headers['X-Institution-Id'] = storedInstitutionId;
    }
    if (storedRole && !config.headers['X-Portal-Role']) {
      config.headers['X-Portal-Role'] = storedRole;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response interceptor ─────────────────────────────────────────────────────
// Normalises all backend error shapes into plain Error objects.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const data = error?.response?.data;

    // FastAPI can return detail as string, object, or array
    let message: string = 'Something went wrong';
    if (typeof data?.detail === 'string') {
      message = data.detail;
    } else if (data?.detail?.message) {
      message = data.detail.message;
    } else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
      // Pydantic validation error array
      message = data.detail.map((e: any) => e.msg).join(', ');
    } else if (data?.message) {
      message = data.message;
    } else if (error?.message) {
      message = error.message;
    }

    return Promise.reject(new Error(message));
  },
);

export default apiClient;
