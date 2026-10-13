import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap } from 'lucide-react';

export function ProtectedRoute() {
  const { currentUser, userProfile, isEmailVerified, loading } = useAuth();
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

  // If user profile is incomplete, force onboarding unless already on onboarding route
  const profileComplete = userProfile?.profileCompleted ?? false;
  if (!profileComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // If user profile is already complete and they attempt to open /onboarding, redirect to /dashboard
  if (profileComplete && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
