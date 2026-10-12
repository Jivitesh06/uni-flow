import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GraduationCap } from 'lucide-react';

interface PublicAuthRouteProps {
  children: React.ReactNode;
}

/**
 * Route wrapper for public auth pages like /login and /register.
 * If a user is already signed in and verified, redirects them directly to /dashboard.
 * If signed in but unverified, redirects to /verify-email.
 * Otherwise, renders the public auth page.
 */
export function PublicAuthRoute({ children }: PublicAuthRouteProps) {
  const { currentUser, isEmailVerified, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 animate-pulse">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 font-medium">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
            <span>Restoring UniFlow session...</span>
          </div>
        </div>
      </div>
    );
  }

  if (currentUser) {
    const verified = Boolean(currentUser.emailVerified || isEmailVerified);
    if (!verified) {
      return <Navigate to="/verify-email" replace />;
    }
    // Return to the previous requested location if provided in location.state
    const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/dashboard';
    return <Navigate to={fromPath} replace />;
  }

  return <>{children}</>;
}
