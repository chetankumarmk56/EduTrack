import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import { getCurrentPortalRole } from '@/shared/lib/portalRole';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request signature builder. Returns null for non-GET requests (mutations
// are never deduped). Kept around so future dedup logic has a single
// canonical place to compute the key; the actual in-flight cache was
// removed because it never populated and confused the 401-retry path.
const getRequestSignature = (config: InternalAxiosRequestConfig): string | null => {
  if (config.method !== 'get') return null;
  const params = new URLSearchParams(config.params || {}).toString();
  const key = params ? `${config.url}?${params}` : config.url;
  return key || null;
};

// Queue to handle multiple simultaneous requests during token refresh
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  if (error) console.error("[Auth] Rejecting queued requests:", error);
  else console.debug("[Auth] Retrying queued requests with new token");

  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor: Inject Auth Token and Institution ID
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const currentRole = getCurrentPortalRole();
    const token = localStorage.getItem(`edu_auth_token_${currentRole}`);
    const institutionId = localStorage.getItem(`edu_institution_id_${currentRole}`) || '1';

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    config.headers.set('X-Institution-Id', institutionId);
    config.headers.set('X-Portal-Role', currentRole); // Tell backend which refresh cookie to check
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 with Token Rotation + Dedup cleanup
client.interceptors.response.use(
  (response) => {
    // Touch the signature so the helper stays warm for future use; the
    // result is intentionally discarded.
    void getRequestSignature(response.config as InternalAxiosRequestConfig);

    // Global Success Toast for mutations if a message is returned
    const method = response.config.method?.toLowerCase();
    const url = response.config.url || '';
    const isAuth = url.includes('login') || url.includes('auth/refresh');
    
    if (['post', 'put', 'patch', 'delete'].includes(method || '') && !isAuth) {
      const message = response.data?.message;
      if (message && typeof message === 'string') {
        toast.success(message);
      } else {
        // Auto-generate friendly success message based on URL and Method
        const segments = url.split('?')[0].split('/').filter(s => s && isNaN(Number(s)));
        let entity = "Record";
        if (segments.length > 0) {
          let lastSegment = segments[segments.length - 1];
          lastSegment = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' ');
          // Basic singularization
          if (lastSegment.endsWith('s') && lastSegment !== 'Class') {
            lastSegment = lastSegment.slice(0, -1);
          }
          entity = lastSegment;
        }

        let actionStr = "processed";
        if (method === 'post') actionStr = "created";
        if (method === 'put' || method === 'patch') actionStr = "updated";
        if (method === 'delete') actionStr = "deleted";

        toast.success(`${entity} ${actionStr} successfully`);
      }
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    void getRequestSignature(originalRequest);

    const role = getCurrentPortalRole();

    // 1. AVOID REFRESH LOOPS & DEADLOCKS:
    // Do not attempt refresh for /auth/refresh OR any /login endpoint
    const isLoginRequest = originalRequest.url?.includes('login');
    if (originalRequest.url?.includes('auth/refresh') || isLoginRequest) {
      if (isLoginRequest) console.debug("[Auth] Bypassing Priority Login Request");
      return Promise.reject(error);
    }

    // 2. Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      const data = error.response.data;
      const errorCode = data?.code || data?.detail?.code;
      const errorDetail = data?.detail?.message || data?.detail || error.message;

      console.error(`[Auth] 401 Unauthorized (${errorCode || 'UNKNOWN'}) for ${originalRequest.url}:`, errorDetail);

      // If we are already retrying or on a login page, don't try to refresh
      if (originalRequest._retry || window.location.pathname.includes('-login')) {
        return Promise.reject(error);
      }

      // If it's a terminal auth error (like INVALID_TOKEN), don't even try to refresh
      if (errorCode === 'INVALID_TOKEN') {
        console.warn("[Auth] Terminal token error. Skipping refresh.");
        if (!window.location.pathname.includes('-login')) {
          localStorage.removeItem(`edu_auth_token_${role}`);
          localStorage.removeItem(`edu_user_${role}`);
          const loginRedirect = `${role === 'admin' ? '/admin-login' :
            role === 'teacher' ? '/teacher-login' :
              role === 'super_admin' ? '/superadmin-login' : '/parent-login'}?reason=expired`;
          window.location.href = loginRedirect;
        }
        return Promise.reject(error);
      }

      console.debug(`[Auth] 401 Detected on ${originalRequest.url}. Attempting rotation for ${role}...`);

      if (isRefreshing) {
        console.debug("[Auth] Refresh already in progress; queuing request.");
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          // Mark the queued request as a retry so a second 401 from the
          // server won't kick off another refresh (which would loop on a
          // backend that revoked the just-issued token).
          originalRequest._retry = true;
          originalRequest.headers.set('Authorization', `Bearer ${token}`);
          return client(originalRequest);
        }).catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await client.post('auth/refresh');
        const { access_token } = response.data;

        console.debug("[Auth] Refresh Successful. Updating access token.");
        localStorage.setItem(`edu_auth_token_${role}`, access_token);

        // Retry original request
        originalRequest.headers.set('Authorization', `Bearer ${access_token}`);
        processQueue(null, access_token);

        return client(originalRequest);
      } catch (refreshError) {
        console.error("[Auth] Refresh Failed. Clearing session for role:", role);
        processQueue(refreshError, null);

        // Only clear and redirect if we are NOT already on a login page
        if (!window.location.pathname.includes('-login')) {
          localStorage.removeItem(`edu_auth_token_${role}`);
          localStorage.removeItem(`edu_user_${role}`);
          localStorage.removeItem(`edu_institution_id_${role}`);

          // Determine the appropriate login redirect based on the current portal
          const loginRedirect = `${role === 'admin' ? '/admin-login' :
            role === 'teacher' ? '/teacher-login' :
              role === 'super_admin' ? '/superadmin-login' : '/parent-login'}?reason=expired`;

          console.debug(`[Auth] Redirecting to ${loginRedirect} due to failed session.`);
          window.location.href = loginRedirect;
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const { message } = getErrorMessage(error);
    
    // Show error toast globally, except for 401s that are actively redirecting to login
    if (error.response?.status !== 401 || window.location.pathname.includes('-login')) {
      toast.error(message);
    }

    return Promise.reject(new Error(message));
  }
);

export default client;
