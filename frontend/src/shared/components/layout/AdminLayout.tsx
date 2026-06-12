import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '../ui/Sidebar';
import TopNav from '../ui/TopNav';
import PageWrapper from '../ui/PageWrapper';
import TeacherAurora from '../ui/TeacherAurora';
import { ToastProvider } from '../ui/Toast';
import { useTheme } from '@/shared/contexts/ThemeContext';

export default function AdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isDark } = useTheme();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark', 'teacher-theme');
      document.documentElement.classList.remove('crystal-theme', 'teacher-light-theme');
    } else {
      document.documentElement.classList.add('teacher-light-theme');
      document.documentElement.classList.remove('dark', 'teacher-theme', 'crystal-theme');
    }
    return () => {
      document.documentElement.classList.remove(
        'dark', 'teacher-theme', 'teacher-light-theme', 'crystal-theme',
      );
    };
  }, [isDark]);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/30 selection:text-primary overflow-x-hidden">
        <TeacherAurora isDark={isDark} />
        <div className="relative z-10">
          <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
          <div className="lg:ml-72 flex min-h-screen min-w-0 flex-col lg:pr-4">
            <TopNav onMenuClick={() => setMobileMenuOpen(prev => !prev)} />
            <main className="flex-1 w-full min-w-0 max-w-full p-3 sm:p-4 md:p-6 overflow-x-clip pb-24 md:pb-8">
              <AnimatePresence mode="wait">
                <PageWrapper key={location.pathname} speed="fast">
                  <Outlet />
                </PageWrapper>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
