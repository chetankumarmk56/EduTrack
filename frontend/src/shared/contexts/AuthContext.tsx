import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { authApi } from '@/features/auth/api';
import { type UserRole } from '@/shared/types';
import { getCurrentPortalRole, isPublicPath } from '@/shared/lib/portalRole';

export interface AuthUser {
  id: number;
  name: string;
  role: UserRole;
  institution_id?: number;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  authState: 'loading' | 'authenticated' | 'unauthenticated';
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAdmin: boolean;
  isTeacher: boolean;
  isParent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();

  // currentRole is now dynamically derived from the URL
  const currentRole = useMemo(() => getCurrentPortalRole(location.pathname), [location.pathname]);

  // Synchronous hydration for instant UI on refresh.
  //
  // The access token now lives in an HttpOnly cookie — JS can't read it.
  // We use `edu_user_${role}` in localStorage as a hint that "there's
  // probably a session" so we render an authenticated shell immediately
  // instead of flashing the login page. The actual auth state is then
  // confirmed against /api/auth/me; if that 401s, the interceptor
  // bounces us to the login page.
  const getInitialState = () => {
    const path = window.location.pathname;
    const role = getCurrentPortalRole(path);
    const savedUser = localStorage.getItem(`edu_user_${role}`);

    if (savedUser) {
      try {
        return {
          // We no longer store the token in JS — the cookie IS the token.
          // The `token` field stays in the context shape for backward
          // compat with any consumer that imports it, but it's a marker
          // (truthy = has-session) not an actual JWT.
          token: 'cookie',
          user: JSON.parse(savedUser) as AuthUser,
          state: 'authenticated' as const
        };
      } catch {
        return { token: null, user: null, state: 'unauthenticated' as const };
      }
    }
    // No user cache → we'll hydrate via /auth/me on mount. Show the
    // loading state only briefly; if the cookie's missing, the 401
    // bounces us to login.
    return { token: null, user: null, state: 'loading' as const };
  };

  const initialState = useMemo(getInitialState, []);

  const [user, setUser] = useState<AuthUser | null>(initialState.user);
  const [token, setToken] = useState<string | null>(initialState.token);
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>(initialState.state);
  const hydrationRef = useRef<string | null>(null);

  // Triggered on mount AND whenever the currentRole (URL) changes.
  //
  // We always probe /api/auth/me here. If the HttpOnly access cookie
  // is present, the call succeeds and we cache the user; if not, the
  // axios interceptor's 401-refresh-or-redirect flow takes over.
  // localStorage's `edu_user_${role}` only gives us a head start on
  // initial paint — it doesn't gate the network call.
  useEffect(() => {
    let isMounted = true;

    const hydrateAndInit = async () => {
      // Public compliance pages (privacy policy, account deletion, terms…)
      // must render for anonymous visitors. Don't probe /auth/me there — it
      // 401s, spams the console with auth errors, and (before the interceptor
      // allowlist fix) bounced logged-out visitors to the login page, which
      // breaks Google Play's requirement that these pages be publicly readable.
      // Read window.location directly (like getInitialState) so this doesn't
      // add a new effect dependency; currentRole already keys the effect.
      if (isPublicPath(window.location.pathname)) {
        if (isMounted) setAuthState('unauthenticated');
        return;
      }

      // Avoid double-hydrating the same role in the same mount cycle.
      if (hydrationRef.current === currentRole) {
        return;
      }
      hydrationRef.current = currentRole;

      if (isMounted && !user) {
        setAuthState('loading');
      }

      try {
        console.debug(`[Auth] Hydrating session for ${currentRole}...`);
        // 5s ceiling so a hung backend can't trap the UI in 'loading'.
        const userData = await Promise.race([
          authApi.getMe(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth hydration timed out after 5s')), 5000)
          ),
        ]) as Awaited<ReturnType<typeof authApi.getMe>>;
        if (!isMounted) return;

        const authUser: AuthUser = {
          id: userData.id,
          name: userData.name || 'User',
          role: userData.role as UserRole,
          institution_id: userData.institution_id || 1
        };

        // Safety check: ensure the token role matches the portal context
        if (authUser.role !== currentRole && authUser.role !== 'super_admin') {
          console.warn(`[Auth] Role mismatch: Cookie has ${authUser.role}, Portal needs ${currentRole}`);
          setAuthState('unauthenticated');
          return;
        }

        setUser(authUser);
        setToken('cookie'); // marker only — actual token lives in HttpOnly cookie
        setAuthState('authenticated');
        localStorage.setItem(`edu_user_${currentRole}`, JSON.stringify(authUser));
      } catch (err) {
        console.error(`[Auth] Hydration Failed for ${currentRole}:`, err);
        if (isMounted) {
          // Cookie is HttpOnly — we can't clear it from JS. The server's
          // 401 path or an explicit /logout call handles that. We just
          // drop the JS-visible user hint.
          localStorage.removeItem(`edu_user_${currentRole}`);
          setToken(null);
          setUser(null);
          setAuthState('unauthenticated');
        }
      }
    };

    hydrateAndInit();
    return () => {
      isMounted = false;
      // React 18 StrictMode mounts effects twice (mount → unmount → mount).
      // Without clearing the marker here, the second mount sees
      // hydrationRef.current === currentRole, returns early, and never
      // fires /auth/me — while the first mount's response is dropped by
      // the `if (!isMounted) return` guard. Net effect: authState stays
      // 'loading' forever and the spinner never resolves.
      if (hydrationRef.current === currentRole) {
        hydrationRef.current = null;
      }
    };
  }, [currentRole]);

  const login = (_newToken: string, newUser: AuthUser) => {
    const storageRole = newUser.role;
    console.debug(`[Auth] Manual Login for ${storageRole}. Syncing state.`);

    // The access token comes via an HttpOnly cookie the backend set on
    // login — we discard `_newToken` here. We KEEP user metadata in
    // localStorage so we can paint the dashboard shell instantly on
    // refresh without waiting for /api/auth/me to round-trip.
    localStorage.removeItem(`edu_user_${storageRole}`);
    localStorage.removeItem(`edu_institution_id_${storageRole}`);

    // Wipe directory caches — they aren't namespaced per user, so a previous
    // user's session would otherwise pollute this user's view.
    Object.keys(localStorage)
      .filter(k => k.startsWith('edu_cache_'))
      .forEach(k => localStorage.removeItem(k));

    localStorage.setItem(`edu_user_${storageRole}`, JSON.stringify(newUser));
    localStorage.setItem(`edu_institution_id_${storageRole}`, String(newUser.institution_id));

    if (storageRole === currentRole || newUser.role === 'super_admin') {
      setToken('cookie'); // truthy marker only
      setUser(newUser);
      setAuthState('authenticated');
      hydrationRef.current = currentRole;
    }
  };

  const logout = async () => {
    // Hit the server first and wait for the response. /api/auth/logout
    // returns Set-Cookie headers that delete the HttpOnly access +
    // refresh cookies; if we fire-and-forget and let the caller do
    // `window.location.href = '/'` immediately, the navigating document
    // tears down before the browser processes those Set-Cookie clears.
    // Net effect: cookies survive, next visit to /parent-login auto-
    // logs the user back in. Awaiting guarantees the cookies are gone
    // before any caller-initiated navigation runs.
    try {
      const { authApi } = await import('@/features/auth/api');
      await authApi.logout?.();
    } catch {
      /* server unreachable — still log out locally */
    }

    setToken(null);
    setUser(null);
    setAuthState('unauthenticated');
    localStorage.removeItem(`edu_user_${currentRole}`);
    localStorage.removeItem(`edu_institution_id_${currentRole}`);
    // Wipe directory caches AND per-page selection state so the next
    // user starts fresh — these keys aren't user-scoped.
    Object.keys(localStorage)
      .filter(k => k.startsWith('edu_cache_') || k === 'edu_active_assignment_id')
      .forEach(k => localStorage.removeItem(k));
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isTeacher = user?.role === 'teacher';
  const isParent = user?.role === 'parent' || user?.role === 'student';

  return (
    <AuthContext.Provider value={{
      user, token, authState, login, logout,
      isAdmin, isTeacher, isParent
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook co-located with provider; consumers import both from one module.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
