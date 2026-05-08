import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { AppProvider } from './lib/AppContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import GuestRoute from './components/auth/GuestRoute';
import Landing from './pages/Landing';
import DashboardLayout from './components/layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Academics from './pages/Academics';
import Attendance from './pages/Attendance';
import Events from './pages/Events';
import Teachers from './pages/Teachers';
import Profile from './pages/Profile';
// Announcement import removed
import Login from './pages/Login';
import Payments from './pages/Payments';
import BusTracking from './pages/parent/BusTracking';
import ParentAnnouncements from './pages/ParentAnnouncements';

// Teacher Imports
import TeacherLayout from './components/layout/TeacherLayout';
import TeacherLogin from './pages/teacher/TeacherLogin';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherAttendance from './pages/teacher/TeacherAttendance';
import LessonPlan from './pages/teacher/LessonPlan';
import QuestionBank from './pages/teacher/QuestionBank';
import TeacherProfile from './pages/teacher/TeacherProfile';
import TeacherEvents from './pages/teacher/TeacherEvents';
import ContactList from './pages/teacher/ContactList';
import TeacherTransport from './pages/teacher/TeacherTransport';
import TeacherAnnouncements from './pages/teacher/TeacherAnnouncements';

// Admin Imports
import AdminLayout from './components/layout/AdminLayout';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDirectory from './pages/admin/StudentDirectory';
import TeacherDirectory from './pages/admin/TeacherDirectory';
import AdminEvents from './pages/admin/AdminEvents';
import AdminClasses from './pages/admin/AdminClasses';
import AdminTransport from './pages/admin/AdminTransport';
import FinanceDashboard from './pages/admin/FinanceDashboard.tsx';
import AdminProfile from './pages/admin/AdminProfile';
// Admin Announcement import removed (stale).

// Super Admin Imports
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import SuperAdminLogin from './pages/superadmin/SuperAdminLogin';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import SuperAdminCredentials from './pages/superadmin/SuperAdminCredentials';
import SuperAdminProfile from './pages/superadmin/SuperAdminProfile';
import { Toaster } from 'react-hot-toast';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary] Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <h2>Something went wrong.</h2>
          <p>An unexpected error occurred. Please reload the page.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', marginTop: 12, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/parent-login" element={<GuestRoute><Login /></GuestRoute>} />

            <Route path="/parent" element={
              <ProtectedRoute allowedRoles={['parent', 'student', 'super_admin']}>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/parent/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="academics" element={<Academics />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="events" element={<Events />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="payments" element={<Payments />} />
              <Route path="bus-tracking" element={<BusTracking />} />
              <Route path="announcements" element={<ParentAnnouncements />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            <Route path="/teacher-login" element={<GuestRoute><TeacherLogin /></GuestRoute>} />
            <Route path="/teacher" element={
              <ProtectedRoute allowedRoles={['teacher', 'super_admin']}>
                <TeacherLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/teacher/dashboard" replace />} />
              <Route path="dashboard" element={<TeacherDashboard />} />
              <Route path="attendance" element={<TeacherAttendance />} />
              <Route path="lesson-plan" element={<LessonPlan />} />
              <Route path="question-bank" element={<QuestionBank />} />
              <Route path="profile" element={<TeacherProfile />} />
              <Route path="events" element={<TeacherEvents />} />
              <Route path="contacts" element={<ContactList />} />
              <Route path="transport" element={<TeacherTransport />} />
              <Route path="announcements" element={<TeacherAnnouncements />} />
            </Route>

            <Route path="/admin-login" element={<GuestRoute><AdminLogin /></GuestRoute>} />
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin', 'finance', 'super_admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/admin/directory" replace />} />
              <Route path="directory" element={<AdminDirectory />} />
              <Route path="classes" element={<AdminClasses />} />
              <Route path="teachers" element={<TeacherDirectory />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="transport" element={<AdminTransport />} />
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="profile" element={<AdminProfile />} />
            </Route>

            {/* Super Admin Routes */}
            <Route path="/superadmin-login" element={<GuestRoute><SuperAdminLogin /></GuestRoute>} />
            <Route path="/superadmin" element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <SuperAdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
              <Route path="dashboard" element={<SuperAdminDashboard />} />
              <Route path="admins" element={<SuperAdminCredentials />} />
              <Route path="profile" element={<SuperAdminProfile />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
