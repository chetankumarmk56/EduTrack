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

/**
 * Public routes that must render for anonymous visitors. These are the landing
 * page, the *-login pages, and the legal / compliance pages required to be
 * reachable without a session (Google Play needs to read the privacy and
 * account-deletion pages without authenticating). A backgrounded /auth/me 401
 * fired on these paths must NOT bounce the visitor to the login page.
 */
const PUBLIC_PATH_PREFIXES = [
  '/privacy-policy',
  '/terms-of-service',
  '/data-processing-agreement',
  '/account-deletion',
  '/data-deletion',
];

export const isPublicPath = (pathname: string = window.location.pathname): boolean =>
  pathname === '/' ||
  pathname.includes('-login') ||
  PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
