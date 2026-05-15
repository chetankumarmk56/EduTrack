/**
 * Aggregated service barrel.
 *
 * Each feature owns its services under `features/<feature>/services/`. This
 * barrel re-exports them so existing consumers continue working unchanged.
 * New consumers should prefer importing directly from the feature module.
 */

export * from '@/shared/types';
export { default as apiClient } from '@/shared/services/apiClient';
export * from '@/features/auth/services/authService';
export * from '@/features/announcements/services/announcementService';
export * from '@/features/finance/services/financeService';
export * from '@/features/marks/services/marksService';
export * from '@/features/attendance/services/attendanceService';
export * from '@/features/directory/services/directoryService';
export * from '@/features/events/services/eventsService';
export * from '@/features/dashboard/services/dashboardService';
export * from '@/features/timetable/services/timetableService';
export * from '@/features/teacher-attendance/services/teacherAttendanceService';
