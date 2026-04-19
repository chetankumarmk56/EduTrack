import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '../ui/Sidebar';
import TopNav from '../ui/TopNav';
import PageWrapper from '../ui/PageWrapper';

/**
 * SuperAdminLayout
 * Special layout for the platform owners.
 * Uses a darker, high-contrast theme to differentiate from school-specific admins.
 */
export default function SuperAdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Add specific classes to document for theme control if needed
    document.documentElement.classList.add('dark', 'superadmin-theme');
    document.documentElement.classList.remove('crystal-theme');
    return () => {
      document.documentElement.classList.remove('dark', 'superadmin-theme');
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 transition-colors duration-500 font-sans selection:bg-cyan-500/30 selection:text-cyan-400">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-900/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 md:ml-72 flex min-h-screen flex-col pr-4">
          <TopNav onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
          
          <main className="flex-1 p-4 md:p-6 overflow-y-auto pb-32 md:pb-8">
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
