export type PortalRole = 'super_admin' | 'admin' | 'teacher' | 'parent';

/**
 * Resolve which portal the user is currently in based on the URL path.
 * Single source of truth for both the API client (token/header selection)
 * and AuthContext (login/refresh routing). Keep these in lock-step.
 *
 * Pass an explicit pathname when you have one (e.g. from useLocation);
 * otherwise it falls back to window.location.pathname.
 */
export const getCurrentPortalRole = (pathname?: string): PortalRole => {
  const path = pathname ?? window.location.pathname;
  if (path.startsWith('/superadmin')) return 'super_admin';
  if (path.startsWith('/admin') || path.includes('admin-login')) return 'admin';
  if (path.startsWith('/teacher') || path.includes('teacher-login')) return 'teacher';
  return 'parent';
};
