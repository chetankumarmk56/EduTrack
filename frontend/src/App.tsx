import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { AppProvider } from '@/shared/contexts/AppContext';
import ProtectedRoute from '@/shared/components/auth/ProtectedRoute';
import GuestRoute from '@/shared/components/auth/GuestRoute';
import Landing from '@/features/landing/pages/Landing';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import Dashboard from '@/features/dashboard/pages/Dashboard';
import Academics from '@/features/academics/pages/Academics';
import Attendance from '@/features/attendance/pages/Attendance';
import Events from '@/features/events/pages/Events';
import Teachers from '@/features/directory/pages/Teachers';
import Profile from '@/features/account/pages/Profile';
// Announcement import removed
import Login from '@/features/auth/pages/Login';
import Payments from '@/features/finance/pages/Payments';
import BusTracking from '@/features/transport/pages/BusTracking';
import ParentAnnouncements from '@/features/announcements/pages/ParentAnnouncements';
import ParentTimetable from '@/features/timetable/pages/ParentTimetable';

// Teacher Imports
import TeacherLayout from '@/shared/components/layout/TeacherLayout';
import TeacherLogin from '@/features/auth/pages/TeacherLogin';
import TeacherDashboard from '@/features/marks/pages/TeacherDashboard';
import TeacherAttendance from '@/features/attendance/pages/TeacherAttendance';
import LessonPlan from '@/features/lesson-plan/pages/LessonPlan';
import QuestionBank from '@/features/question-bank/pages/QuestionBank';
import MyFiles from '@/features/my-files/pages/MyFiles';
import TeacherProfile from '@/features/account/pages/TeacherProfile';
import TeacherEvents from '@/features/events/pages/TeacherEvents';
import ContactList from '@/features/contacts/pages/ContactList';
import TeacherTransport from '@/features/transport/pages/TeacherTransport';
import TeacherAnnouncements from '@/features/announcements/pages/TeacherAnnouncements';
import TeacherTimetable from '@/features/timetable/pages/TeacherTimetable';
import TeacherAttendanceLeave from '@/features/teacher-attendance/pages/TeacherAttendanceLeave';

// Admin Imports
import AdminLayout from '@/shared/components/layout/AdminLayout';
import AdminLogin from '@/features/auth/pages/AdminLogin';
import AdminDirectory from '@/features/directory/pages/StudentDirectory';
import TeacherDirectory from '@/features/directory/pages/TeacherDirectory';
import AdminEvents from '@/features/events/pages/AdminEvents';
import AdminClasses from '@/features/academics/pages/AdminClasses';
import AdminTimetable from '@/features/timetable/pages/AdminTimetable';
import AdminTransport from '@/features/transport/pages/AdminTransport';
import FinanceDashboard from '@/features/finance/pages/FinanceDashboard';
import AdminProfile from '@/features/account/pages/AdminProfile';
import TeacherAttendanceAdmin from '@/features/teacher-attendance/pages/TeacherAttendanceAdmin';
// Admin Announcement import removed (stale).

// Super Admin Imports
import SuperAdminLayout from '@/shared/components/layout/SuperAdminLayout';
import SuperAdminLogin from '@/features/auth/pages/SuperAdminLogin';
import SuperAdminDashboard from '@/features/super-admin/pages/SuperAdminDashboard';
import SuperAdminCredentials from '@/features/super-admin/pages/SuperAdminCredentials';
import SuperAdminProfile from '@/features/account/pages/SuperAdminProfile';
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
              <Route path="timetable" element={<ParentTimetable />} />
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
              <Route path="files" element={<MyFiles />} />
              <Route path="profile" element={<TeacherProfile />} />
              <Route path="events" element={<TeacherEvents />} />
              <Route path="contacts" element={<ContactList />} />
              <Route path="transport" element={<TeacherTransport />} />
              <Route path="announcements" element={<TeacherAnnouncements />} />
              <Route path="timetable" element={<TeacherTimetable />} />
              <Route path="my-attendance" element={<TeacherAttendanceLeave />} />
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
              <Route path="timetable" element={<AdminTimetable />} />
              <Route path="teachers" element={<TeacherDirectory />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="transport" element={<AdminTransport />} />
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="teacher-attendance" element={<TeacherAttendanceAdmin />} />
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
