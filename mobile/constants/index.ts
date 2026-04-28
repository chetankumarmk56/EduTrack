export { Colors } from './Colors';

// API Base URL — reads from EXPO_PUBLIC_API_BASE_URL env var,
// falls back to localhost for local development
export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ||
  'http://localhost:8000/api';

// Secure storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'edu_access_token',
  USER: 'edu_user',
  INSTITUTION_ID: 'edu_institution_id',
  ROLE: 'edu_role',
};

// App info
export const APP_NAME = 'EduTrack';
export const APP_TAGLINE = 'Your Academic Companion';

// Priority config for announcements
export const PRIORITY_CONFIG = {
  high: {
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    label: 'Urgent',
  },
  medium: {
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    label: 'Normal',
  },
  low: {
    color: '#4f46e5',
    bg: 'rgba(79,70,229,0.12)',
    label: 'Info',
  },
};
