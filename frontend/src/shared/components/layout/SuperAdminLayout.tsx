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
          : 'bg-[#f0f9ff] text-[#0c4a6e] selection:bg-cyan-200/60 selection:text-cyan-800',
      )}
    >
      {/* Background ambience */}
      {isDark ? (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-900/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-900/10 blur-[120px] rounded-full" />
        </div>
      ) : (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ background: '#f0f9ff' }}>
          {/* Soft center glow */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle at 50% 40%, rgba(8,145,178,0.05) 0%, transparent 65%)' }}
          />
          {/* Rotating pastel orbs */}
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.04, 1] }}
            transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
            className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%]"
          >
            <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full blur-[130px]" style={{ background: 'rgba(34,211,238,0.07)' }} />
            <div className="absolute bottom-[20%] right-[20%] w-[40%] h-[40%] rounded-full blur-[130px]" style={{ background: 'rgba(96,165,250,0.06)' }} />
          </motion.div>
          {/* Primary cyan pulse */}
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.06, 0.13, 0.06], x: [0, 40, 0], y: [0, -20, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full blur-[150px]"
            style={{ background: 'rgba(8,145,178,0.12)' }}
          />
          {/* Secondary blue pulse */}
          <motion.div
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.04, 0.10, 0.04], x: [0, -38, 0], y: [0, 20, 0] }}
            transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full blur-[160px]"
            style={{ background: 'rgba(59,130,246,0.08)' }}
          />
          {/* Dot-grid texture */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(12,74,110,0.07) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              opacity: 0.5,
            }}
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
