import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

interface GuestRouteProps {
  children: ReactNode;
}

const GuestRoute = ({ children }: GuestRouteProps) => {
  const { authState, user } = useAuth();

  if (authState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (authState === 'authenticated' && user) {
    const defaultPath = user.role === 'super_admin' ? '/superadmin/dashboard' :
                        user.role === 'teacher' ? '/teacher/dashboard' : 
                        user.role === 'admin' ? '/admin/directory' : 
                        '/parent/dashboard';
    
    return <Navigate to={defaultPath} replace />;
  }

  return <>{children}</>;
};

export default GuestRoute;
