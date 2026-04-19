import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '../ui/Sidebar';
import TopNav from '../ui/TopNav';
import PageWrapper from '../ui/PageWrapper';
import TeacherAurora from '../ui/TeacherAurora';

export default function AdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.add('dark', 'teacher-theme');
    document.documentElement.classList.remove('crystal-theme');
    return () => {
      document.documentElement.classList.remove('dark', 'teacher-theme');
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/30 selection:text-primary">
      <TeacherAurora />

      <div className="relative z-10">
        {/* Desktop Sidebar (Role-aware — shows Admin nav for admin routes) */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="md:ml-72 flex min-h-screen flex-col pr-4">
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
