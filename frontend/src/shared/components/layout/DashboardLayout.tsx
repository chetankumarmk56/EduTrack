import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '../ui/Sidebar';
import TopNav from '../ui/TopNav';
import PageWrapper from '../ui/PageWrapper';
import ParentAurora from '../ui/ParentAurora';

export default function DashboardLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.add('crystal-theme');
    document.documentElement.classList.remove('dark', 'teacher-theme');
    document.body.style.overflow = 'unset';
    return () => {
      document.documentElement.classList.remove('crystal-theme');
    };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/30 selection:text-primary overflow-x-hidden">
      <ParentAurora />
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="md:ml-72 flex min-h-screen min-w-0 flex-col md:pr-4">
        <TopNav onMenuClick={() => setMobileMenuOpen(prev => !prev)} />
        <main className="flex-1 w-full min-w-0 max-w-full p-3 sm:p-4 md:p-6 overflow-x-clip pb-24 md:pb-8">
          <AnimatePresence>
            <PageWrapper key={location.pathname} speed="smooth">
              <Outlet />
            </PageWrapper>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
