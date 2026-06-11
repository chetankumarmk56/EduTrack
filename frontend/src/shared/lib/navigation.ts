import {
  LayoutDashboard,
  GraduationCap,
  CalendarDays,
  CalendarRange,
  Bell,
  Users,
  Phone,
  Book,
  PenTool,
  FolderOpen,
  UserCheck,
  CreditCard,
  Building2,
  BookOpen,
  Globe,
  Wallet,
  Landmark,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

/**
 * Centralized navigation configuration.
 * The order of items in each array is the canonical display order for both
 * desktop sidebar and any mobile/responsive navigation surfaces.
 *
 * To reorder a portal's menu, change the order of entries below — no other
 * component changes are required.
 */

export const teacherNavItems: NavItem[] = [
  { name: 'My Attendance', path: '/teacher/my-attendance', icon: UserCheck },
  { name: 'Attendance', path: '/teacher/attendance', icon: CalendarDays },
  { name: 'Marks', path: '/teacher/dashboard', icon: LayoutDashboard },
  { name: 'Timetable', path: '/teacher/timetable', icon: CalendarRange },
  { name: 'Announcements', path: '/teacher/announcements', icon: Bell },
  { name: 'Contact List', path: '/teacher/contacts', icon: Phone },
  { name: 'Events', path: '/teacher/events', icon: Bell },
  { name: 'Lesson Plan', path: '/teacher/lesson-plan', icon: Book },
  { name: 'Question Bank', path: '/teacher/question-bank', icon: PenTool },
  { name: 'My Files', path: '/teacher/files', icon: FolderOpen },
];

export const parentNavItems: NavItem[] = [
  { name: 'Dashboard', path: '/parent/dashboard', icon: LayoutDashboard },
  { name: 'Academics', path: '/parent/academics', icon: GraduationCap },
  { name: 'Attendance', path: '/parent/attendance', icon: CalendarDays },
  { name: 'Timetable', path: '/parent/timetable', icon: CalendarRange },
  { name: 'Announcements', path: '/parent/announcements', icon: Bell },
  { name: 'Teachers', path: '/parent/teachers', icon: Users },
  { name: 'Events', path: '/parent/events', icon: Bell },
  { name: 'Fees & Payments', path: '/parent/fee-pay', icon: Wallet },
];

export const adminNavItems: NavItem[] = [
  { name: 'Academic Setup', path: '/admin/classes', icon: Building2 },
  { name: 'Students', path: '/admin/directory', icon: Users },
  { name: 'Teacher', path: '/admin/teachers', icon: BookOpen },
  { name: 'Timetable', path: '/admin/timetable', icon: CalendarRange },
  { name: 'Events', path: '/admin/events', icon: Bell },
  { name: 'Staff Attendance', path: '/admin/teacher-attendance', icon: UserCheck },
  { name: 'Finance', path: '/admin/finance', icon: CreditCard },
  { name: 'Payment Verification', path: '/admin/manual-payments', icon: Landmark },
];

export const superAdminNavItems: NavItem[] = [
  { name: 'Schools', path: '/superadmin/dashboard', icon: Building2 },
  { name: 'Schools Overview', path: '/superadmin/schools-overview', icon: Globe },
  { name: 'Admins', path: '/superadmin/admins', icon: Users },
];

export const navItemsByRoutePrefix: { prefix: string; items: NavItem[] }[] = [
  { prefix: '/teacher', items: teacherNavItems },
  { prefix: '/admin', items: adminNavItems },
  { prefix: '/superadmin', items: superAdminNavItems },
  { prefix: '/parent', items: parentNavItems },
];

export function getNavItemsForPath(pathname: string): NavItem[] {
  const match = navItemsByRoutePrefix.find(({ prefix }) => pathname.startsWith(prefix));
  return match ? match.items : parentNavItems;
}

// Re-exported so any future surface (e.g., a search icon header) can reuse it.
export { Globe };
