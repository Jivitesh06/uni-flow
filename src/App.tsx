import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicAuthRoute } from './components/auth/PublicAuthRoute';
import { DashboardPage } from './pages/DashboardPage';
import { TimetablePage } from './pages/TimetablePage';
import { AcademicCalendarPage } from './pages/AcademicCalendarPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { AttendancePage } from './pages/AttendancePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { EmailSyncPage } from './pages/EmailSyncPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminRoute } from './components/auth/AdminRoute';
import { AdminPublishPage } from './pages/AdminPublishPage';
import { AdminGmailSyncPage } from './pages/AdminGmailSyncPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { useAuth } from './contexts/AuthContext';

function RootLandingRoute() {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }
  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: '12px',
                background: '#333',
                color: '#fff',
                fontSize: '13px',
              },
            }}
          />
          <Routes>
            {/* Public landing page with direct redirect for authenticated students */}
            <Route path="/" element={<RootLandingRoute />} />

            {/* Public auth routes with auto-redirect if already authenticated */}
            <Route
              path="/login"
              element={
                <PublicAuthRoute>
                  <LoginPage />
                </PublicAuthRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicAuthRoute>
                  <RegisterPage />
                </PublicAuthRoute>
              }
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Protected application routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/timetable" element={<TimetablePage />} />
                <Route path="/academic-calendar" element={<AcademicCalendarPage />} />
                <Route path="/subjects" element={<Navigate to="/attendance" replace />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/email-sync" element={<Navigate to="/dashboard" replace />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Protected Admin Publishing Console */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin/publish" element={<AdminPublishPage />} />
                  <Route path="/admin/gmail-sync" element={<AdminGmailSyncPage />} />
                  <Route path="/dashboard/admin/publish" element={<Navigate to="/admin/publish" replace />} />
                </Route>
              </Route>
            </Route>

            {/* 404 fallback */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
