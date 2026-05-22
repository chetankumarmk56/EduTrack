import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type PortalTheme = 'dark' | 'light';

interface ThemeContextType {
  theme: PortalTheme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<PortalTheme>(() => {
    return (localStorage.getItem('edu_portal_theme') as PortalTheme) || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('edu_portal_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
