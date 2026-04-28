import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants';

export interface AuthUser {
  id: number;
  name: string;
  email?: string;
  role: 'parent' | 'student' | 'teacher' | 'admin' | 'super_admin';
  institution_id?: number;
  [key: string]: any;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  institutionId: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser, institutionId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState<string>('1');
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app boot
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [storedToken, storedUser, storedInstitution] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
          SecureStore.getItemAsync(STORAGE_KEYS.USER),
          SecureStore.getItemAsync(STORAGE_KEYS.INSTITUTION_ID),
        ]);

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          setInstitutionId(storedInstitution || '1');
        }
      } catch (error) {
        console.error('[AuthContext] Session restore error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async (newToken: string, newUser: AuthUser, newInstitutionId: string) => {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, newToken),
      SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(newUser)),
      SecureStore.setItemAsync(STORAGE_KEYS.INSTITUTION_ID, newInstitutionId),
      SecureStore.setItemAsync(STORAGE_KEYS.ROLE, newUser.role),
    ]);
    setToken(newToken);
    setUser(newUser);
    setInstitutionId(newInstitutionId);
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.USER),
      SecureStore.deleteItemAsync(STORAGE_KEYS.INSTITUTION_ID),
      SecureStore.deleteItemAsync(STORAGE_KEYS.ROLE),
    ]);
    setToken(null);
    setUser(null);
    setInstitutionId('1');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        institutionId,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
