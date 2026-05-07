import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants';
import { Storage } from '../utils/storage';
import apiClient, { onAuthExpired } from '../services/apiClient';

export interface AuthUser {
  id: number;
  student_id?: number;
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
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [institutionId, setInstitutionId] = useState<string>('1');
  const [isLoading, setIsLoading] = useState(true);

  // Helper to fetch the actual profile and reconcile IDs
  const fetchProfile = useCallback(async (authToken: string) => {
    try {
      // Use the provided token for this specific request if needed, 
      // but apiClient interceptor should handle it if set.
      const res = await apiClient.get('directory/my-profile', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const profile = res.data;
      return profile;
    } catch (e) {
      console.error('[AuthContext] Failed to fetch profile:', e);
      return null;
    }
  }, []);

  const login = useCallback(async (newToken: string, newUser: AuthUser, newInstitutionId: string) => {
    setToken(newToken);
    setInstitutionId(newInstitutionId);

    // Fetch the correct student/teacher profile ID
    const profile = await fetchProfile(newToken);
    
    const enrichedUser: AuthUser = {
      ...newUser,
      student_id: profile?.id || newUser.student_id || newUser.id,
      // If we got a profile, ensure the role-specific ID is correct
      id: profile?.user_id || newUser.id, 
    };

    await Promise.all([
      Storage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newToken),
      Storage.setItem(STORAGE_KEYS.USER, JSON.stringify(enrichedUser)),
      Storage.setItem(STORAGE_KEYS.INSTITUTION_ID, newInstitutionId),
      Storage.setItem(STORAGE_KEYS.ROLE, newUser.role),
    ]);
    
    setUser(enrichedUser);
  }, [fetchProfile]);

  const logout = useCallback(async () => {
    await Promise.all([
      Storage.deleteItem(STORAGE_KEYS.ACCESS_TOKEN),
      Storage.deleteItem(STORAGE_KEYS.USER),
      Storage.deleteItem(STORAGE_KEYS.INSTITUTION_ID),
      Storage.deleteItem(STORAGE_KEYS.ROLE),
    ]);
    setToken(null);
    setUser(null);
    setInstitutionId('1');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const profile = await fetchProfile(token);
    if (profile && user) {
      const updatedUser = {
        ...user,
        student_id: profile.id,
      };
      setUser(updatedUser);
      await Storage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    }
  }, [token, user, fetchProfile]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [storedToken, storedUser, storedInstitution] = await Promise.all([
          Storage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
          Storage.getItem(STORAGE_KEYS.USER),
          Storage.getItem(STORAGE_KEYS.INSTITUTION_ID),
        ]);

        if (storedToken && storedUser) {
          setToken(storedToken);
          setInstitutionId(storedInstitution || '1');
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);

          // Re-validate profile ID in background
          fetchProfile(storedToken).then(async (profile) => {
            if (profile && profile.id !== parsedUser.student_id) {
              const updated = { ...parsedUser, student_id: profile.id };
              setUser(updated);
              await Storage.setItem(STORAGE_KEYS.USER, JSON.stringify(updated));
            }
          });
        }
      } catch (error) {
        console.error('[AuthContext] Session restore error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Subscribe to 401 events from the API client and auto-logout
  useEffect(() => {
    const unsubscribe = onAuthExpired(() => {
      console.warn('[AuthContext] Session expired — logging out');
      setToken(null);
      setUser(null);
      setInstitutionId('1');
    });
    return unsubscribe;
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
        refreshProfile,
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
