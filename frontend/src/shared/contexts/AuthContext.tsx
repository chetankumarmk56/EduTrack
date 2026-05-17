import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { authApi } from '@/features/auth/api';
import { type UserRole } from '@/shared/types';
import { getCurrentPortalRole } from '@/shared/lib/portalRole';

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

  // Synchronous Hydration for instant UI on refresh
  const getInitialState = () => {
    // We can't use location here easily as it's a hook, but we can use window.location
    const path = window.location.pathname;
    const role = getCurrentPortalRole(path);
    const savedToken = localStorage.getItem(`edu_auth_token_${role}`);
    const savedUser = localStorage.getItem(`edu_user_${role}`);

    if (savedToken && savedUser) {
      try {
        return {
          token: savedToken,
          user: JSON.parse(savedUser) as AuthUser,
          state: 'authenticated' as const
        };
      } catch {
        return { token: null, user: null, state: 'unauthenticated' as const };
      }
    }
    // If there's a token but no cached user, we need to hydrate via /auth/me.
    if (savedToken) {
      return { token: savedToken, user: null, state: 'loading' as const };
    }
    // No token at all → don't show the spinner, just render the login page.
    return { token: null, user: null, state: 'unauthenticated' as const };
  };

  const initialState = useMemo(getInitialState, []);

  const [user, setUser] = useState<AuthUser | null>(initialState.user);
  const [token, setToken] = useState<string | null>(initialState.token);
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>(initialState.state);
  const hydrationRef = useRef<string | null>(null);

  // Triggered on mount AND whenever the currentRole (URL) changes
  useEffect(() => {
    let isMounted = true;

    const hydrateAndInit = async () => {
      const savedToken = localStorage.getItem(`edu_auth_token_${currentRole}`);

      // 1. Avoid redundant hydration if we already have a valid user matching this role
      if (user?.role === currentRole && authState === 'authenticated') {
        return;
      }

      // 2. Avoid re-hydrating the exact same token/role combination multiple times
      const hydrationKey = `${currentRole}:${savedToken}`;
      if (hydrationRef.current === hydrationKey) {
        return;
      }

      if (!savedToken) {
        if (isMounted) {
          console.debug(`[Auth] No token for ${currentRole}. Setting unauthenticated.`);
          setToken(null);
          setUser(null);
          setAuthState('unauthenticated');
        }
        return;
      }

      hydrationRef.current = hydrationKey;

      // Only set loading if we don't have a user already (optimistic hydration)
      if (isMounted && !user) {
        setToken(savedToken);
        setAuthState('loading');
      }

      try {
        console.debug(`[Auth] Hydrating session for ${currentRole}...`);
        // Race the API call against a 5s timeout so a hung backend / network
        // can never trap the UI in the 'loading' state forever.
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
          console.warn(`[Auth] Role mismatch: Token has ${authUser.role}, Portal needs ${currentRole}`);
          setAuthState('unauthenticated');
          return;
        }

        setUser(authUser);
        setAuthState('authenticated');
        localStorage.setItem(`edu_user_${currentRole}`, JSON.stringify(authUser));
      } catch (err) {
        console.error(`[Auth] Hydration Failed for ${currentRole}:`, err);
        if (isMounted) {
          localStorage.removeItem(`edu_auth_token_${currentRole}`);
          localStorage.removeItem(`edu_user_${currentRole}`);
          setToken(null);
          setUser(null);
          setAuthState('unauthenticated');
        }
      }
    };

    hydrateAndInit();
    return () => { isMounted = false; };
  }, [currentRole]);

  const login = (newToken: string, newUser: AuthUser) => {
    const storageRole = newUser.role;
    console.debug(`[Auth] Manual Login for ${storageRole}. Syncing state.`);

    // Clear old token before storing new one (prevents stale tokens if switching users same role)
    localStorage.removeItem(`edu_auth_token_${storageRole}`);
    localStorage.removeItem(`edu_user_${storageRole}`);
    localStorage.removeItem(`edu_institution_id_${storageRole}`);

    // Wipe directory caches — they aren't namespaced per user, so a previous
    // user's session would otherwise pollute this user's view (e.g. a teacher
    // logging in inheriting an admin's full student list, or stale "0 students"
    // from before a class assignment was made).
    Object.keys(localStorage)
      .filter(k => k.startsWith('edu_cache_'))
      .forEach(k => localStorage.removeItem(k));

    // Persist to role-specific namespaces BEFORE updating state to avoid race with interceptors
    localStorage.setItem(`edu_auth_token_${storageRole}`, newToken);
    localStorage.setItem(`edu_user_${storageRole}`, JSON.stringify(newUser));
    localStorage.setItem(`edu_institution_id_${storageRole}`, String(newUser.institution_id));

    // Update local state (if the role matches current view)
    if (storageRole === currentRole || newUser.role === 'super_admin') {
      setToken(newToken);
      setUser(newUser);
      setAuthState('authenticated');
      // Update the hydration ref so the effect knows we're already good
      hydrationRef.current = `${currentRole}:${newToken}`;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setAuthState('unauthenticated');
    localStorage.removeItem(`edu_auth_token_${currentRole}`);
    localStorage.removeItem(`edu_user_${currentRole}`);
    localStorage.removeItem(`edu_institution_id_${currentRole}`);
    // Wipe directory caches AND per-page selection state (e.g. activeAssignmentId)
    // so the next user starts fresh — these keys aren't user-scoped.
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
