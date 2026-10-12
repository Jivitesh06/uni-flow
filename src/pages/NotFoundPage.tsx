import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, Home, Compass } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';

export function NotFoundPage() {
  const { currentUser, isEmailVerified } = useAuth();
  const navigate = useNavigate();
  const isAuthenticated = Boolean(currentUser && (currentUser.emailVerified || isEmailVerified));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-4 text-center">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center mb-6">
          <Compass className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 mb-3">
          Error 404
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Page Not Found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
          The page you are looking for doesn't exist, has been moved, or the link may be broken.
        </p>

        <div className="space-y-3">
          {isAuthenticated ? (
            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center justify-center gap-2 font-semibold"
            >
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 font-semibold"
            >
              <Home className="w-4 h-4" />
              Return to Home
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="w-full flex items-center justify-center gap-2 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-2 text-xs text-gray-400">
          <GraduationCap className="w-4 h-4 text-blue-600" />
          <span>UniFlow — Your College Life, In Sync.</span>
        </div>
      </div>
    </div>
  );
}
