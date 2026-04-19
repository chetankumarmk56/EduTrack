import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '../api/authApi';
import { type UserRole } from '../types';

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
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('edu_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('edu_auth_token'));
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>(
    token ? 'loading' : 'unauthenticated'
  );

  useEffect(() => {
    const initAuth = async () => {
      if (!token) {
        setAuthState('unauthenticated');
        return;
      }
      try {
        const userData = await authApi.getMe();
        const authUser: AuthUser = {
          id: userData.id,
          name: userData.name || 'User',
          role: userData.role as UserRole,
          institution_id: userData.institution_id || 1
        };
        setUser(authUser);
        setAuthState('authenticated');
        localStorage.setItem('edu_user', JSON.stringify(authUser));
      } catch (err) {
        console.error("Auth Hydration Failed:", err);
        logout();
      }
    };

    if (authState === 'loading') {
      initAuth();
    }
  }, [token]);

  const login = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    setAuthState('authenticated');
    localStorage.setItem('edu_auth_token', newToken);
    localStorage.setItem('edu_user', JSON.stringify(newUser));
    localStorage.setItem('edu_institution_id', String(newUser.institution_id));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setAuthState('unauthenticated');
    localStorage.removeItem('edu_auth_token');
    localStorage.removeItem('edu_user');
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
