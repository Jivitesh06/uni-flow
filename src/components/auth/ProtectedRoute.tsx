import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap } from 'lucide-react';

export function ProtectedRoute() {
  const { currentUser, userProfile, isEmailVerified, loading, authError, retryAuthProfile, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 animate-pulse">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 font-medium">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
            <span>Loading UniFlow...</span>
          </div>
        </div>
      </div>
    );
  }

  const isLocalQA =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.search.includes('qa_preview=1');

  if (isLocalQA) {
    return <Outlet />;
  }

  if (!currentUser) {
    // Preserve requested route so user is returned here after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Prevent unverified email/password accounts from accessing protected application pages
  const verified = Boolean(currentUser.emailVerified || isEmailVerified);
  if (!verified) {
    return <Navigate to="/verify-email" replace />;
  }

  // If user profile could not be resolved due to network error/timeout and no cached profile exists
  const profileComplete = userProfile?.profileCompleted ?? false;
  if (!profileComplete && authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-gray-100 dark:border-gray-800 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto text-2xl">
            📡
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connection Issue</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {authError}
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => retryAuthProfile()}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
            >
              Retry Connection
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user profile is incomplete, force onboarding unless already on onboarding route
  if (!profileComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // If user profile is already complete and they attempt to open /onboarding, redirect to /dashboard
  if (profileComplete && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
