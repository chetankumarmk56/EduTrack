import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ('super_admin' | 'admin' | 'teacher' | 'student' | 'parent')[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { authState, user } = useAuth();
  const location = useLocation();

  if (authState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (authState === 'unauthenticated' || !user) {
    // Determine which login page to redirect to based on the current path
    if (location.pathname.startsWith('/admin')) {
      return <Navigate to="/admin-login" state={{ from: location }} replace />;
    }
    if (location.pathname.startsWith('/teacher')) {
      return <Navigate to="/teacher-login" state={{ from: location }} replace />;
    }
    if (location.pathname.startsWith('/superadmin')) {
      return <Navigate to="/superadmin-login" state={{ from: location }} replace />;
    }
    return <Navigate to="/parent-login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If authenticated but role not allowed, redirect to their default dashboard
    const defaultPath = user.role === 'super_admin' ? '/superadmin/dashboard' :
                        user.role === 'teacher' ? '/teacher/dashboard' :
                        user.role === 'admin' ? '/admin/directory' :
                        '/parent/dashboard';
    
    return <Navigate to={defaultPath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
