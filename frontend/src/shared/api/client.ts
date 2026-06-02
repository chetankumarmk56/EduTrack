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
interface QueuedRequest {
  resolve: (value: string | null) => void;
  reject: (reason?: unknown) => void;
}
let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
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

// Request Interceptor: Inject institution + role headers.
//
// We deliberately do NOT attach an Authorization header anymore. The
// access token now lives in an HttpOnly cookie set by the backend on
// login, and rides along with every request because the axios client
// has `withCredentials: true`. Keeping the token JS-accessible
// (localStorage) was the H10 issue — XSS could exfiltrate it.
//
// X-Portal-Role tells the backend which role-scoped access cookie to
// match (a browser can hold sister sessions across portals).
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const currentRole = getCurrentPortalRole();

    // Honor an X-Institution-Id the caller set explicitly (e.g. the login
    // dispatcher attaches the value typed into the form). Only fall back to
    // localStorage — and the legacy '1' default — when no explicit value was
    // provided. Previously this branch ran unconditionally and clobbered the
    // form's Institution ID with a stale/default localStorage value, which is
    // how admin login ended up sending '1' and the backend rejected it with
    // "Unknown Institution ID."
    if (!config.headers.has('X-Institution-Id')) {
      const institutionId = localStorage.getItem(`edu_institution_id_${currentRole}`) || '1';
      config.headers.set('X-Institution-Id', institutionId);
    }
    config.headers.set('X-Portal-Role', currentRole);
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

      // If we are already retrying, on a login page, or on the public
      // landing page, don't try to refresh. The landing route is the
      // public entry — a 401 from a backgrounded /auth/me there should
      // just leave the user on Landing, not bounce them to login.
      const onPublicPage = window.location.pathname === '/' || window.location.pathname.includes('-login');
      if (originalRequest._retry || onPublicPage) {
        return Promise.reject(error);
      }

      // If it's a terminal auth error (like INVALID_TOKEN), don't even try to refresh
      if (errorCode === 'INVALID_TOKEN') {
        console.warn("[Auth] Terminal token error. Skipping refresh.");
        const onPublicPageTerminal = window.location.pathname === '/' || window.location.pathname.includes('-login');
        if (!onPublicPageTerminal) {
          // No token in localStorage anymore (it lives in an HttpOnly
          // cookie). Just drop the user metadata so the next mount
          // hydrates fresh from /api/auth/me, which will 401 and route
          // here, this time to the login page.
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
        }).then(() => {
          // Mark the queued request as a retry so a second 401 from the
          // server won't kick off another refresh. The browser already
          // has the new access cookie at this point — no header to set.
          originalRequest._retry = true;
          return client(originalRequest);
        }).catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // The refresh endpoint reads the HttpOnly refresh cookie and
        // re-stamps a fresh HttpOnly access cookie. We don't need to
        // touch localStorage or attach a Bearer header on the retry —
        // the browser will pick up the new cookie automatically.
        await client.post('auth/refresh');

        console.debug("[Auth] Refresh Successful — cookie re-stamped.");
        processQueue(null, null);

        return client(originalRequest);
      } catch (refreshError) {
        console.error("[Auth] Refresh Failed. Clearing session for role:", role);
        processQueue(refreshError, null);

        // Only clear and redirect if we are NOT already on a login page
        // or the public landing page. The access token cookie is HttpOnly
        // so the server clears it for us on /logout. Here we only wipe
        // the JS-visible bits.
        const onPublicPageAfterRefresh = window.location.pathname === '/' || window.location.pathname.includes('-login');
        if (!onPublicPageAfterRefresh) {
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
