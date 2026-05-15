import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '../ui/Sidebar';
import TopNav from '../ui/TopNav';
import PageWrapper from '../ui/PageWrapper';
import ParentAurora from '../ui/ParentAurora';

export default function DashboardLayout() {
  const location = useLocation();

  useEffect(() => {
    // Inject Crystal Theme for Parent Portal
    document.documentElement.classList.add('crystal-theme');
    document.documentElement.classList.remove('dark', 'teacher-theme');
    
    // Safety Reset: Ensure any leftover scroll-lock from modals is cleared on navigation
    document.body.style.overflow = 'unset';

    return () => {
      document.documentElement.classList.remove('crystal-theme');
    };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/30 selection:text-primary">
      <ParentAurora />
      {/* Desktop Sidebar (Role-aware) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="md:ml-72 flex min-h-screen flex-col pr-4">
        <TopNav />
        
        <main className="flex-1 p-4 md:p-6 overflow-y-auto pb-32 md:pb-8">
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
