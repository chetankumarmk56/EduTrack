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

// ─── Tunables ─────────────────────────────────────────────────────────────────
// Generous timeout so a slow first request — TLS handshake, a brief nginx /
// gunicorn warm-up right after a redeploy, or a flaky mobile network — isn't
// cut off before the server can respond. 45s leaves comfortable headroom.
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
  // Set once we've replayed a request after a silent token refresh, so a
  // second 401 on the same request can't trigger an infinite refresh loop.
  __retriedAfterRefresh?: boolean;
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

// ─── Silent access-token refresh (mobile) ────────────────────────────────────
// Native clients have no cookie jar, so the short-lived access token can't be
// rotated by the browser the way the web SPA does. When a request 401s with a
// token attached, we exchange the stored refresh token for a fresh access
// token and replay the request once. Single-flight: if many requests 401 at
// the same expiry, only ONE /auth/refresh call goes out and the rest reuse it.
let isRefreshing = false;
let refreshWaiters: ((token: string | null) => void)[] = [];

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise<string | null>((resolve) => refreshWaiters.push(resolve));
  }
  isRefreshing = true;
  let newToken: string | null = null;
  try {
    const [refreshToken, role] = await Promise.all([
      Storage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
      Storage.getItem(STORAGE_KEYS.ROLE),
    ]);
    if (refreshToken) {
      // Bare axios (NOT apiClient) so this never re-enters the response
      // interceptor / refresh logic.
      const resp = await axios.post(getFullURL(API_BASE_URL, 'auth/refresh'), null, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'X-Refresh-Token': refreshToken,
          'X-Portal-Role': role || 'parent',
          'X-Client': 'mobile',
        },
      });
      const token: string | undefined = resp?.data?.access_token;
      if (token) {
        await Storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
        newToken = token;
      }
    }
  } catch (e: any) {
    console.warn('[API] token refresh failed:', e?.message);
    newToken = null;
  } finally {
    isRefreshing = false;
    const waiters = refreshWaiters;
    refreshWaiters = [];
    waiters.forEach((w) => w(newToken));
  }
  return newToken;
}

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
    // Identify the native client so the backend returns the refresh token in
    // the login body (no cookie jar here) and accepts X-Refresh-Token on
    // /auth/refresh. Harmless/ignored by the web-oriented endpoints.
    if (!config.headers['X-Client']) {
      config.headers['X-Client'] = 'mobile';
    }

    return config;
  },
  (error) => {
    console.error('[API Request Init Error]', error.message);
    return Promise.reject(error);
  },
);

// ─── Response interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = (error?.config || {}) as RetryableConfig;
    const data: any = error?.response?.data;

    // ── Auto-retry transient network failures (network-blip friendly) ──────
    // We retry GETs and idempotent HEAD/OPTIONS by default. Login POSTs are
    // also retried: re-submitting the same credentials produces the same result
    // with no side effects, so a cold-start timeout shouldn't surface as a
    // bogus "no response" to the user. Other POST/PUT/PATCH/DELETE are never
    // retried since they may have committed work the client didn't observe.
    const method = (config.method || 'get').toLowerCase();
    const requestPath: string = config.url || '';
    const isLoginPost = method === 'post' && /\/login(\?|$)/.test(requestPath);
    const isIdempotent =
      method === 'get' || method === 'head' || method === 'options' || isLoginPost;
    const transient = isTransientNetworkError(error);
    const retryCount = config.__retryCount ?? 0;

    if (transient && isIdempotent && retryCount < MAX_NETWORK_RETRIES) {
      config.__retryCount = retryCount + 1;
      const delay = RETRY_BACKOFF_MS[retryCount] ?? 3_500;
      console.warn(
        `[API RETRY ${config.__retryCount}/${MAX_NETWORK_RETRIES}] ${method.toUpperCase()} ${config.url} ` +
        `— no response (transient network error). Retrying in ${delay}ms…`,
      );
      await sleep(delay);
      // Hand the same config back to axios; the request interceptor will
      // re-attach the latest token from storage before sending.
      return apiClient(config as AxiosRequestConfig);
    }

    // ── At this point we're giving up. ──────────────────────────────────────
    const status = error?.response?.status ?? '???';
    const fullURL = getFullURL(config.baseURL, config.url);

    // A 401 on a request that *had no Authorization header* means the request
    // fired during a logout race (e.g. a drawer screen's useEffect rerunning
    // while the redirect to /login is in flight). The user is already on
    // their way out — there's no real "session expired" event to report and
    // storage is already empty. Demote the log and skip the rebroadcast.
    const requestUrl: string = config.url || '';
    const isLoginRequest = requestUrl.includes('/login');
    const hadAuthHeader = !!(config.headers as any)?.Authorization;
    const isLogoutRace = error?.response?.status === 401 && !hadAuthHeader;

    if (isLogoutRace) {
      console.warn(
        `[API] 401 with no token — ignoring (logout race): ${method.toUpperCase()} ${config.url}`,
      );
    } else {
      console.error(`[API ERROR] ${status} ${method.toUpperCase()} ${config.url}`, {
        fullURL,
        data,
        statusText: error?.response?.statusText || 'no response',
        attempts: retryCount + 1,
      });
    }

    // ── Silent refresh before giving up on a 401 ────────────────────────────
    // A 401 with a token attached usually just means the access token expired.
    // Rotate it via the stored refresh token and replay the request ONCE. If
    // refresh fails (no/expired refresh token), we fall through to the existing
    // clear-session-and-logout path below — so the worst case is identical to
    // the previous behavior. Never refresh on the refresh call itself.
    const isRefreshCall = requestUrl.includes('auth/refresh');
    if (
      error?.response?.status === 401 &&
      hadAuthHeader &&
      !isLoginRequest &&
      !isRefreshCall &&
      !isLogoutRace &&
      !config.__retriedAfterRefresh
    ) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        config.__retriedAfterRefresh = true;
        config.headers = config.headers || ({} as any);
        (config.headers as any).Authorization = `Bearer ${newToken}`;
        return apiClient(config as AxiosRequestConfig);
      }
      // refresh failed → fall through to logout below.
    }

    // ── Auto-logout on 401 ──────────────────────────────────────────────────
    // Skip for login endpoints — a 401 there means "wrong credentials",
    // not "session expired". Skip for the logout race too — broadcasting
    // would just trigger a redundant "Session expired" warning.
    if (error?.response?.status === 401 && !isLoginRequest && !isLogoutRace) {
      console.warn('[API] 401 Unauthorized — clearing session and broadcasting logout');
      await Promise.all(
        Object.values(STORAGE_KEYS).map((k) => Storage.deleteItem(k)),
      );
      broadcastAuthExpired();
    }

    // ── Build a user-friendly error message ─────────────────────────────────
    let message = 'Something went wrong';
    if (transient) {
      // Survived all the retries — the server is genuinely unreachable from
      // here (no network / DNS failure / the API host is down or blocking
      // this origin via CORS).
      message =
        "Couldn't reach the server. Check your internet connection and " +
        'try again in a moment.';
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
