import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isFirebaseConfigured } from '../../lib/firebase';
import { formatAuthError, FormattedAuthError } from '../../lib/authErrors';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import toast from 'react-hot-toast';

export function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<FormattedAuthError | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      const user = await signIn(email, password);
      if (!user.emailVerified) {
        toast('Please verify your email address to access UniFlow.', { icon: '📧' });
        navigate('/verify-email');
      } else {
        toast.success('Signed in successfully!');
        navigate(fromPath, { replace: true });
      }
    } catch (err: unknown) {
      const formatted = formatAuthError(err, 'login');
      setAuthError(formatted);
      toast.error(formatted.message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
      toast.success('Signed in with Google!');
      navigate(fromPath, { replace: true });
    } catch (err: unknown) {
      const formatted = formatAuthError(err, 'login');
      setAuthError(formatted);
      toast.error(formatted.message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <div className="w-full max-w-md">
        {/* Back to Home Link */}
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
        </div>

        <div className="flex flex-col items-center mb-8 text-center">
          <Link to="/" className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25 hover:scale-105 transition-transform">
            <GraduationCap className="w-8 h-8 text-white" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back to UniFlow</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Your College Life, In Sync.</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-800">
          {!isFirebaseConfigured && (
            <div className="mb-5 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl flex items-start gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <span className="font-semibold block text-amber-950 dark:text-amber-100 mb-0.5">Firebase Configuration Required</span>
                Add your Firebase web credentials to <code className="font-mono bg-amber-100/80 dark:bg-amber-900/50 px-1 py-0.5 rounded">.env</code> to connect live auth, or enable <code className="font-mono bg-amber-100/80 dark:bg-amber-900/50 px-1 py-0.5 rounded">VITE_USE_FIREBASE_EMULATOR=true</code> with local Firebase emulators.
              </div>
            </div>
          )}

          {authError && (
            <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-start gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
                <span className="font-semibold block text-red-950 dark:text-red-100 mb-0.5">Authentication Note</span>
                <span>{authError.message}</span>
                {authError.suggestedAction === 'signup' && (
                  <div className="mt-2 pt-2 border-t border-red-200/60 dark:border-red-900/40">
                    <Link to="/register" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      → Need an account? Click here to sign up
                    </Link>
                  </div>
                )}
                {authError.suggestedAction === 'reset-password' && (
                  <div className="mt-2 pt-2 border-t border-red-200/60 dark:border-red-900/40">
                    <Link to="/forgot-password" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      → Forgot your password? Reset it here
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                College / University Email
              </label>
              <Input
                type="email"
                placeholder="student@college.edu"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authError) setAuthError(null);
                }}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <Link to="/forgot-password" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full mt-2" loading={loading}>
              Sign In
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-800" />
            </div>
            <div className="relative flex justify-center text-xs text-gray-500 bg-white dark:bg-gray-900 px-3 uppercase tracking-wider">
              Or continue with
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} loading={loading}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
