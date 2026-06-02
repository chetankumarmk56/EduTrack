import { Component, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { AppProvider } from '@/shared/contexts/AppContext';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';
import ProtectedRoute from '@/shared/components/auth/ProtectedRoute';
import GuestRoute from '@/shared/components/auth/GuestRoute';
import { Toaster } from 'react-hot-toast';

// Eagerly load only the public entry (Landing) and the shell pieces.
// Every other page is code-split so visiting one portal doesn't drag in the
// others — the biggest single win for initial load time.
import Landing from '@/features/landing/pages/Landing';

// Parent / Student portal
const DashboardLayout = lazy(() => import('@/shared/components/layout/DashboardLayout'));
const Dashboard = lazy(() => import('@/features/dashboard/pages/Dashboard'));
const Academics = lazy(() => import('@/features/academics/pages/Academics'));
const Attendance = lazy(() => import('@/features/attendance/pages/Attendance'));
const Events = lazy(() => import('@/features/events/pages/Events'));
const Teachers = lazy(() => import('@/features/directory/pages/Teachers'));
const Profile = lazy(() => import('@/features/account/pages/Profile'));
const Login = lazy(() => import('@/features/auth/pages/Login'));
const ParentManualPayment = lazy(() => import('@/features/manual-payments/pages/ParentManualPayment'));
const ParentAnnouncements = lazy(() => import('@/features/announcements/pages/ParentAnnouncements'));
const ParentTimetable = lazy(() => import('@/features/timetable/pages/ParentTimetable'));

// Teacher portal
const TeacherLayout = lazy(() => import('@/shared/components/layout/TeacherLayout'));
const TeacherLogin = lazy(() => import('@/features/auth/pages/TeacherLogin'));
const TeacherDashboard = lazy(() => import('@/features/marks/pages/TeacherDashboard'));
const TeacherAttendance = lazy(() => import('@/features/attendance/pages/TeacherAttendance'));
const LessonPlanDashboard = lazy(() => import('@/features/lesson-plan/ai/pages/LessonPlanDashboard'));
const LessonPlan = lazy(() => import('@/features/lesson-plan/ai/pages/AILessonPlan'));
const AILessonPlanResult = lazy(() => import('@/features/lesson-plan/ai/pages/AILessonPlanResult'));
const QuestionBank = lazy(() => import('@/features/question-bank/pages/QuestionBank'));
const QuestionBankResult = lazy(() => import('@/features/question-bank/pages/QuestionBankResult'));
const MyFiles = lazy(() => import('@/features/my-files/pages/MyFiles'));
const TeacherProfile = lazy(() => import('@/features/account/pages/TeacherProfile'));
const TeacherEvents = lazy(() => import('@/features/events/pages/TeacherEvents'));
const ContactList = lazy(() => import('@/features/contacts/pages/ContactList'));
const TeacherAnnouncements = lazy(() => import('@/features/announcements/pages/TeacherAnnouncements'));
const TeacherTimetable = lazy(() => import('@/features/timetable/pages/TeacherTimetable'));
const TeacherAttendanceLeave = lazy(() => import('@/features/teacher-attendance/pages/TeacherAttendanceLeave'));

// Admin portal
const AdminLayout = lazy(() => import('@/shared/components/layout/AdminLayout'));
const AdminLogin = lazy(() => import('@/features/auth/pages/AdminLogin'));
const AdminDirectory = lazy(() => import('@/features/directory/pages/StudentDirectory'));
const TeacherDirectory = lazy(() => import('@/features/directory/pages/TeacherDirectory'));
const AdminEvents = lazy(() => import('@/features/events/pages/AdminEvents'));
const AdminClasses = lazy(() => import('@/features/academics/pages/AdminClasses'));
const AdminTimetable = lazy(() => import('@/features/timetable/pages/AdminTimetable'));
const FinanceDashboard = lazy(() => import('@/features/finance/pages/FinanceDashboard'));
const AdminManualPayments = lazy(() => import('@/features/manual-payments/pages/AdminManualPayments'));
const AdminProfile = lazy(() => import('@/features/account/pages/AdminProfile'));
const TeacherAttendanceAdmin = lazy(() => import('@/features/teacher-attendance/pages/TeacherAttendanceAdmin'));

// Super Admin portal
const SuperAdminLayout = lazy(() => import('@/shared/components/layout/SuperAdminLayout'));
const SuperAdminLogin = lazy(() => import('@/features/auth/pages/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('@/features/super-admin/pages/SuperAdminDashboard'));
const SchoolsOverview = lazy(() => import('@/features/super-admin/pages/SchoolsOverview'));
const SuperAdminCredentials = lazy(() => import('@/features/super-admin/pages/SuperAdminCredentials'));
const SuperAdminProfile = lazy(() => import('@/features/account/pages/SuperAdminProfile'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500" />
    </div>
  );
}

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
        <ThemeProvider>
        <AppProvider>
          <Toaster position="top-right" />
          <Suspense fallback={<RouteFallback />}>
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
              {/* Legacy /payments URL kept as a redirect so older bookmarks
                  still resolve to the current UPI flow. */}
              <Route path="payments" element={<Navigate to="/parent/fee-pay" replace />} />
              <Route path="fee-pay" element={<ParentManualPayment />} />
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
              <Route path="lesson-plan" element={<LessonPlanDashboard />} />
              <Route path="lesson-plan/new" element={<LessonPlan />} />
              <Route path="lesson-plan/result" element={<AILessonPlanResult />} />
              <Route path="question-bank" element={<QuestionBank />} />
              <Route path="question-bank/result" element={<QuestionBankResult />} />
              <Route path="files" element={<MyFiles />} />
              <Route path="profile" element={<TeacherProfile />} />
              <Route path="events" element={<TeacherEvents />} />
              <Route path="contacts" element={<ContactList />} />
              <Route path="announcements" element={<TeacherAnnouncements />} />
              <Route path="timetable" element={<TeacherTimetable />} />
              <Route path="my-attendance" element={<TeacherAttendanceLeave />} />
            </Route>

            <Route path="/admin-login" element={<GuestRoute><AdminLogin /></GuestRoute>} />
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/admin/directory" replace />} />
              <Route path="directory" element={<AdminDirectory />} />
              <Route path="classes" element={<AdminClasses />} />
              <Route path="timetable" element={<AdminTimetable />} />
              <Route path="teachers" element={<TeacherDirectory />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="finance" element={<FinanceDashboard />} />
              <Route path="manual-payments" element={<AdminManualPayments />} />
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
              <Route path="schools-overview" element={<SchoolsOverview />} />
              <Route path="admins" element={<SuperAdminCredentials />} />
              <Route path="profile" element={<SuperAdminProfile />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </AppProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
