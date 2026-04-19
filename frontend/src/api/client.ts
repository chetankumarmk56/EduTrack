import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject Auth Token and Institution ID
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('edu_auth_token');
    const institutionId = localStorage.getItem('edu_institution_id') || '1';

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Always inject the context institution ID
    config.headers.set('X-Institution-Id', institutionId);

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle common errors (e.g., 401 Unauthorized)
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Clear stale session and redirect to home so user can pick the right portal
        const alreadyRedirecting = sessionStorage.getItem('redirecting_401');
        if (!alreadyRedirecting && !window.location.pathname.includes('-login')) {
          sessionStorage.setItem('redirecting_401', '1');
          localStorage.removeItem('edu_auth_token');
          localStorage.removeItem('edu_user');
          // Brief delay to let in-flight requests settle
          setTimeout(() => {
            sessionStorage.removeItem('redirecting_401');
            window.location.href = '/';
          }, 200);
        }
        console.warn('Session expired or invalid — clearing credentials.');
      }

      const message = error.response.data?.detail || error.message;
      return Promise.reject(new Error(message));
    }
    return Promise.reject(error);
  }
);

export default client;
