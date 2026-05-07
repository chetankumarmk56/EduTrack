import axios from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../constants';
import { Storage } from '../utils/storage';

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

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  async (error) => {
    const data = error?.response?.data;
    const status = error?.response?.status || '???';
    const fullURL = getFullURL(error?.config?.baseURL, error?.config?.url);

    console.error(`[API ERROR] ${status} ${error?.config?.method?.toUpperCase()} ${error?.config?.url}`, {
      fullURL,
      data,
      statusText: error?.response?.statusText || 'no response',
    });

    // Auto-logout on 401: clear storage and notify listeners
    if (error?.response?.status === 401) {
      console.warn('[API] 401 Unauthorized — clearing session and broadcasting logout');
      await Promise.all(
        Object.values(STORAGE_KEYS).map((k) => Storage.deleteItem(k)),
      );
      broadcastAuthExpired();
    }

    let message: string = 'Something went wrong';
    if (typeof data?.detail === 'string') {
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
