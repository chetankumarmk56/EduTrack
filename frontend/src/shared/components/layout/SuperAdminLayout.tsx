import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '../ui/Sidebar';
import TopNav from '../ui/TopNav';
import PageWrapper from '../ui/PageWrapper';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { cn } from '@/shared/lib/utils';

export default function SuperAdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isDark } = useTheme();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark', 'superadmin-theme');
      document.documentElement.classList.remove('crystal-theme', 'superadmin-light-theme');
    } else {
      document.documentElement.classList.add('superadmin-light-theme');
      document.documentElement.classList.remove('dark', 'superadmin-theme', 'crystal-theme');
    }
    return () => {
      document.documentElement.classList.remove(
        'dark', 'superadmin-theme', 'superadmin-light-theme', 'crystal-theme',
      );
    };
  }, [isDark]);

  return (
    <div
      className={cn(
        'min-h-screen transition-colors duration-500 font-sans overflow-x-hidden',
        isDark
          ? 'bg-slate-950 text-slate-50 selection:bg-cyan-500/30 selection:text-cyan-400'
          : 'bg-[#f5fbff] text-slate-900 selection:bg-cyan-200/60 selection:text-cyan-900',
      )}
    >
      {/* Background ambience.
          Dark mode: same two-orb wash as before.
          Light mode: a single calm sky gradient with two soft cyan halos at
          the corners. The previous rotating orbs + dot-grid looked busy
          against the now-translucent white cards and competed with the
          content; this version reads as a clean studio backdrop. */}
      {isDark ? (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-900/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-900/10 blur-[120px] rounded-full" />
        </div>
      ) : (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, #f5fbff 0%, #eef7ff 60%, #f5fbff 100%)' }}
          />
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}
            className="absolute -top-32 -right-32 w-[640px] h-[640px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(8,145,178,0.10) 0%, transparent 70%)' }}
          />
          <div
            className="absolute -bottom-40 -left-32 w-[560px] h-[560px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)' }}
          />
        </div>
      )}

      <div className="relative z-10 flex">
        <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
        <div className="flex-1 md:ml-72 flex min-h-screen flex-col pr-4">
          <TopNav onMenuClick={() => setMobileMenuOpen(prev => !prev)} />
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto pb-24 md:pb-8">
            <AnimatePresence mode="wait">
              <PageWrapper key={location.pathname} speed="fast">
                <Outlet />
              </PageWrapper>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
