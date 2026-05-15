import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '@/shared/constants';
import { Storage } from '@/shared/utils/storage';

// Broadcast channel for auth events — avoids circular import with AuthContext
type AuthEventListener = () => void;
const authListeners: AuthEventListener[] = [];
export function onAuthExpired(listener: AuthEventListener) {
  authListeners.push(listener);
  return () => {
    const idx = authListeners.indexOf(listener);
    if (idx >= 0) authListeners.splice(idx, 1);
  };
}
function broadcastAuthExpired() {
  authListeners.forEach((fn) => fn());
}

console.log('[API Client] Initializing with BASE_URL:', API_BASE_URL);

// ─── Tunables ─────────────────────────────────────────────────────────────────
// Render.com free-tier services spin down after 15 min of inactivity and need
// ~30–60s to wake up. The default 15s timeout was firing before the server
// could respond on first hit. 45s covers a normal cold start with headroom.
const REQUEST_TIMEOUT_MS = 45_000;
// Retries apply ONLY to network-level failures (no response, ECONNABORTED).
// HTTP 4xx/5xx are never retried — those are real responses with intent.
const MAX_NETWORK_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_500, 3_500] as const;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Extend the request config with our retry bookkeeping. Cast at use-sites so
// no other code has to know about it.
interface RetryableConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when axios couldn't get any HTTP response (DNS failure, timeout, etc). */
function isTransientNetworkError(error: AxiosError): boolean {
  if (error.response) return false; // server replied with a status — not transient
  // axios's `code` is 'ECONNABORTED' on timeout; everything else without a
  // response (no DNS, dropped TCP, captive portal, etc) is a transient network
  // error from the client's perspective.
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ERR_NETWORK' ||
    error.message === 'Network Error' ||
    !error.response
  );
}

// Helper for robust URL joining in logs
const getFullURL = (baseURL: string = '', url: string = '') => {
  if (baseURL.endsWith('/') && url.startsWith('/')) {
    return `${baseURL.slice(0, -1)}${url}`;
  }
  if (!baseURL.endsWith('/') && !url.startsWith('/')) {
    return `${baseURL}/${url}`;
  }
  return `${baseURL}${url}`;
};

// ─── Request interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  async (config) => {
    const [token, storedInstitutionId, storedRole] = await Promise.all([
      Storage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
      Storage.getItem(STORAGE_KEYS.INSTITUTION_ID),
      Storage.getItem(STORAGE_KEYS.ROLE),
    ]);

    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    if (storedInstitutionId && !config.headers['X-Institution-Id']) {
      config.headers['X-Institution-Id'] = storedInstitutionId;
    }
    if (storedRole && !config.headers['X-Portal-Role']) {
      config.headers['X-Portal-Role'] = storedRole;
    }

    // DEBUG LOGGING
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
      fullURL: getFullURL(config.baseURL, config.url),
      hasToken: !!token,
      instId: storedInstitutionId,
      role: storedRole,
    });

    return config;
  },
  (error) => {
    console.error('[API Request Init Error]', error.message);
    return Promise.reject(error);
  },
);

// ─── Response interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API OK] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    return response;
  },
  async (error: AxiosError) => {
    const config = (error?.config || {}) as RetryableConfig;
    const data: any = error?.response?.data;

    // ── Auto-retry transient network failures (cold-start friendly) ─────────
    // We retry GETs and idempotent HEAD/OPTIONS only — never POST/PUT/PATCH/DELETE
    // since those may have side effects on the server even when the client
    // never saw the response.
    const method = (config.method || 'get').toLowerCase();
    const isIdempotent = method === 'get' || method === 'head' || method === 'options';
    const transient = isTransientNetworkError(error);
    const retryCount = config.__retryCount ?? 0;

    if (transient && isIdempotent && retryCount < MAX_NETWORK_RETRIES) {
      config.__retryCount = retryCount + 1;
      const delay = RETRY_BACKOFF_MS[retryCount] ?? 3_500;
      console.warn(
        `[API RETRY ${config.__retryCount}/${MAX_NETWORK_RETRIES}] ${method.toUpperCase()} ${config.url} ` +
        `— no response (likely backend cold-start). Retrying in ${delay}ms…`,
      );
      await sleep(delay);
      // Hand the same config back to axios; the request interceptor will
      // re-attach the latest token from storage before sending.
      return apiClient(config as AxiosRequestConfig);
    }

    // ── At this point we're giving up: log it. ──────────────────────────────
    const status = error?.response?.status ?? '???';
    const fullURL = getFullURL(config.baseURL, config.url);

    console.error(`[API ERROR] ${status} ${method.toUpperCase()} ${config.url}`, {
      fullURL,
      data,
      statusText: error?.response?.statusText || 'no response',
      attempts: retryCount + 1,
    });

    // ── Auto-logout on 401 ──────────────────────────────────────────────────
    // Skip for login endpoints — a 401 there means "wrong credentials",
    // not "session expired". Without this guard, a failed login attempt would
    // wipe storage and trigger a misleading "Session expired" warning.
    const requestUrl: string = config.url || '';
    const isLoginRequest = requestUrl.includes('/login');
    if (error?.response?.status === 401 && !isLoginRequest) {
      console.warn('[API] 401 Unauthorized — clearing session and broadcasting logout');
      await Promise.all(
        Object.values(STORAGE_KEYS).map((k) => Storage.deleteItem(k)),
      );
      broadcastAuthExpired();
    }

    // ── Build a user-friendly error message ─────────────────────────────────
    let message = 'Something went wrong';
    if (transient) {
      // Survived all the retries — the server is genuinely unreachable.
      message =
        "Couldn't reach the server. Check your internet connection and try " +
        'again. If the issue persists, the server may be starting up.';
    } else if (typeof data?.detail === 'string') {
      message = data.detail;
    } else if (data?.detail?.message) {
      message = data.detail.message;
    } else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
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
