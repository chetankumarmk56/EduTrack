import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, GraduationCap, CalendarDays,
  Bell, LogOut, Users,
  ChevronRight, Shield, Book, PenTool, BookOpen, Building2, Phone, Globe, CreditCard,
  MapPin
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';
import { useApp } from '../../lib/AppContext';

const parentNavItems = [
  { name: 'Dashboard', path: '/parent/dashboard', icon: LayoutDashboard },
  { name: 'Academics', path: '/parent/academics', icon: GraduationCap },
  { name: 'Attendance', path: '/parent/attendance', icon: CalendarDays },
  { name: 'Events', path: '/parent/events', icon: Bell },
  { name: 'Teachers', path: '/parent/teachers', icon: Users },
  { name: 'Bus Tracking', path: '/parent/bus-tracking', icon: MapPin },
  { name: 'Payments', path: '/parent/payments', icon: CreditCard },
  { name: 'Announcements', path: '/parent/announcements', icon: Bell },
];

const teacherNavItems = [
  { name: 'Marks Entry', path: '/teacher/dashboard', icon: LayoutDashboard },
  { name: 'Attendance', path: '/teacher/attendance', icon: CalendarDays },
  { name: 'Events', path: '/teacher/events', icon: Bell },
  { name: 'Contact List', path: '/teacher/contacts', icon: Phone },
  { name: 'Lesson Plan', path: '/teacher/lesson-plan', icon: Book },
  { name: 'Transport Roster', path: '/teacher/transport', icon: MapPin },
  { name: 'Question Bank', path: '/teacher/question-bank', icon: PenTool },
  { name: 'Announcements', path: '/teacher/announcements', icon: Bell },
];

const adminNavItems = [
  { name: 'Student Roster', path: '/admin/directory', icon: Users },
  { name: 'Teacher Directory', path: '/admin/teachers', icon: BookOpen },
  { name: 'Academic Setup', path: '/admin/classes', icon: Building2 },
  { name: 'Event Directory', path: '/admin/events', icon: Bell },
  { name: 'Bus Logistics', path: '/admin/transport', icon: MapPin },
  { name: 'Finance Terminal', path: '/admin/finance', icon: CreditCard },
];

const superAdminNavItems = [
  { name: 'Schools', path: '/superadmin/dashboard', icon: Building2 },
  { name: 'Admins', path: '/superadmin/admins', icon: Users },
];

export default function Sidebar() {
  const location = useLocation();
  const isTeacher = location.pathname.startsWith('/teacher');
  const isAdmin = location.pathname.startsWith('/admin');
  const isSuperAdmin = location.pathname.startsWith('/superadmin');

  const { logout, user } = useAuth();
  const { institutionName } = useApp();
  
  const navItems = isTeacher ? teacherNavItems : isAdmin ? adminNavItems : isSuperAdmin ? superAdminNavItems : parentNavItems;
  const portalName = user?.role === 'teacher' ? 'Faculty' : user?.role === 'super_admin' ? 'Platform' : user?.role === 'admin' ? 'Admin' : user?.role === 'finance' ? 'Finance' : 'Family';

  const handleSignOut = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "circOut" }}
      className="fixed left-4 top-4 bottom-4 z-40 w-64 floating-panel hidden md:flex flex-col overflow-hidden"
    >
      {/* Subtle gradient backdrop inside sidebar */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/10 blur-[60px]" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-primary/10 blur-[60px]" />
      </div>

      <div className="relative flex h-16 items-center px-6 shrink-0 border-b border-glass-border">
        <div className="flex items-center gap-3 w-full">
          <motion.div
            whileHover={{ rotate: 15, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 }}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl font-black text-xl shadow-lg shrink-0",
              (isTeacher || isAdmin) 
                ? "aurora-gradient text-white shadow-primary/20" 
                : isSuperAdmin
                  ? "bg-cyan-600 text-white shadow-cyan-500/20"
                  : "bg-primary text-primary-foreground shadow-black/5"
            )}
          >
            {isSuperAdmin ? <Globe className="h-6 w-6" /> : isAdmin ? <Shield className="h-6 w-6" /> : <Building2 className="h-5 w-5" />}
          </motion.div>
          <div className="flex flex-col justify-center -space-y-0.5 overflow-hidden">
            <span className="text-lg font-black tracking-tighter glow-text leading-tight truncate w-full" title={institutionName}>{institutionName}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary opacity-80">{portalName}</span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto py-4 px-4 custom-scrollbar">
        <ul className="space-y-1">
          {navItems.map((item: any, index: number) => {
            const isActive = location.pathname.startsWith(item.path);

            return (
              <motion.li
                key={item.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  to={item.path}
                  className={cn(
                    "flex items-center rounded-xl px-4 py-3 text-sm transition-all duration-500 group relative overflow-hidden border border-transparent hover:border-black/5 hover:bg-black/5",
                      isActive
                        ? (isTeacher || isAdmin)
                          ? "aurora-gradient text-white shadow-xl shadow-primary/30 aurora-glow aurora-pulse aurora-border-trace scale-[1.02] font-black"
                          : isSuperAdmin
                            ? "bg-cyan-600 text-cyan-50 shadow-lg shadow-cyan-500/30 scale-[1.02] font-black"
                            : "bg-primary text-primary-foreground shadow-lg shadow-black/10 font-bold"
                        : "text-muted-foreground hover:bg-black/5 hover:text-foreground hover:translate-x-1"
                  )}
                >
                  <item.icon className={cn(
                    "mr-3 h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                    isActive 
                      ? "text-current" 
                      : "text-muted-foreground group-hover:text-primary"
                  )} />
                  <span className="flex-1">{item.name}</span>

                  {isActive && (
                    <motion.div
                      layoutId="sidebar-pill"
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="absolute right-2 w-1.5 h-1.5 rounded-full bg-primary-foreground"
                    />
                  )}
                  {!isActive && <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 ml-auto" />}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <div className="relative p-4 border-t border-glass-border bg-slate-500/5">
        <ul className="space-y-1">
          <li>
            <motion.button
              whileHover={{ x: 3 }}
              onClick={handleSignOut}
              className="w-full flex items-center rounded-xl px-4 py-2 text-sm font-bold text-danger hover:bg-danger/10 transition-all"
            >
              <LogOut className="mr-3 h-4 w-4" />
              Sign out
            </motion.button>
          </li>
        </ul>
      </div>
    </motion.aside>
  );
}
