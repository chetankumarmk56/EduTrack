import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Menu, ChevronDown, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { cn } from '@/shared/lib/utils';

interface TopNavProps {
  onMenuClick?: () => void;
}

export default function TopNav({ onMenuClick }: TopNavProps) {
  const { user } = useAuth();
  const { teacherDirectory, classDirectory, institutionName } = useApp();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isPortalUser = isTeacher || isAdmin;

  // Only show the toggle on teacher / admin / superadmin portals,
  // not on the parent crystal-theme portal (already light).
  const showThemeToggle =
    location.pathname.startsWith('/teacher') ||
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/superadmin');

  const userDisplayName = useMemo(() => {
    if (isTeacher && user?.id && teacherDirectory.length) {
      const teacher = teacherDirectory.find((t: any) => t.user_id === user.id);
      if (teacher) return teacher.name;
    }
    if (user?.role === 'parent' && user?.id && classDirectory.length) {
      const student = classDirectory.find((s: any) => s.id === user.id);
      if (student) return `${student.name}'s Family`;
    }
    return user?.name || 'Guest User';
  }, [user, teacherDirectory, classDirectory, isTeacher]);

  const handleProfileClick = () => {
    if (isTeacher) navigate('/teacher/profile');
    else if (user?.role === 'super_admin') navigate('/superadmin/profile');
    else if (isAdmin) navigate('/admin/profile');
    else navigate('/parent/profile');
  };

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 100 }}
        className="sticky top-4 z-30 mx-4 h-16 floating-panel glass-effect flex items-center px-6 gap-4"
      >
        {/* Brand / Menu Segment */}
        <div className="flex items-center gap-4 min-w-max">
          <button
            onClick={onMenuClick}
            className="rounded-xl p-2 md:hidden hover:bg-muted/50 transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="md:hidden">
            <span className="text-xl font-black tracking-tight text-primary glow-text">
              {institutionName?.[0] || 'E'}.
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Actions Segment */}
        <div className="flex items-center gap-3 min-w-max">
          {/* Theme toggle — teacher / admin / superadmin portals only */}
          {showThemeToggle && (
            <motion.button
              onClick={toggleTheme}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={cn(
                'relative h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 border',
                isDark
                  ? 'bg-white/8 border-white/10 hover:bg-white/14 hover:border-white/20'
                  : 'bg-black/5 border-black/8 hover:bg-black/10 hover:border-black/14',
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.span
                    key="sun"
                    initial={{ opacity: 0, rotate: -30, scale: 0.7 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 30, scale: 0.7 }}
                    transition={{ duration: 0.2 }}
                    className="absolute"
                  >
                    <Sun className="h-4 w-4 text-amber-400" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="moon"
                    initial={{ opacity: 0, rotate: 30, scale: 0.7 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: -30, scale: 0.7 }}
                    transition={{ duration: 0.2 }}
                    className="absolute"
                  >
                    <Moon className="h-4 w-4 text-slate-600" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}

          {/* Clickable Profile Area */}
          <motion.button
            whileHover={{ x: 2 }}
            onClick={handleProfileClick}
            className="flex items-center gap-2 pl-1 cursor-pointer group bg-transparent border-none outline-none"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary glow-text leading-none mb-0.5">
                {isTeacher ? 'Faculty' : isAdmin ? 'Admin' : 'Family'}
              </p>
              <p className="text-xs font-bold truncate max-w-[240px] leading-none">
                {userDisplayName}
              </p>
            </div>
            <div className={cn(
              'h-9 w-9 rounded-xl flex items-center justify-center text-primary-foreground shadow-lg overflow-hidden border border-white/20 group-hover:border-primary transition-all duration-300',
              (isTeacher || isAdmin) ? 'aurora-gradient aurora-glow shadow-primary/20' : 'bg-primary shadow-black/5',
            )}>
              <User className="h-4 w-4" />
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-all duration-300" />
          </motion.button>
        </div>
      </motion.header>
    </>
  );
}
