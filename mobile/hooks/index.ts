/**
 * Aggregated hook barrel.
 *
 * Each feature owns its hooks under `features/<feature>/hooks/`. This barrel
 * re-exports them so existing consumers continue working unchanged. New
 * consumers should prefer importing directly from the feature module.
 */

export { useAuth, AuthProvider } from '@/features/auth/hooks/useAuth';
export { useLogin, type LoginMode } from '@/features/auth/hooks/useLogin';
export { useStudentData } from '@/features/students/hooks/useStudentData';
export { useDashboard } from '@/features/dashboard/hooks/useDashboard';
