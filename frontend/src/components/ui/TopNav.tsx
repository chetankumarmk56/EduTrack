import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  User, Menu, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useApp } from '../../lib/AppContext';
import { cn } from '../../lib/utils';
import NotificationMenu from './NotificationMenu';

interface TopNavProps {
  onMenuClick?: () => void;
}

export default function TopNav({ onMenuClick }: TopNavProps) {
  const { user } = useAuth();
  const { teacherDirectory, classDirectory, institutionName } = useApp();
  const navigate = useNavigate();

  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

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
        <div className="flex items-center gap-4 min-w-max">
          <NotificationMenu />

          <div className="h-8 w-px bg-glass-border mx-1 hidden sm:block"></div>

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
              "h-9 w-9 rounded-xl flex items-center justify-center text-primary-foreground shadow-lg overflow-hidden border border-white/20 group-hover:border-primary transition-all duration-300",
              (isTeacher || isAdmin) ? "aurora-gradient aurora-glow shadow-primary/20" : "bg-primary shadow-black/5"
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
