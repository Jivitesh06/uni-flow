import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle2, AlertCircle, LogOut, Send, GraduationCap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import toast from 'react-hot-toast';

export function VerifyEmailPage() {
  const { currentUser, isEmailVerified, reloadUser, resendVerificationEmail, logout, loading } = useAuth();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [justVerified, setJustVerified] = useState(false);

  // If already verified, forward to dashboard immediately
  useEffect(() => {
    if (!loading && (!currentUser || isEmailVerified || currentUser.emailVerified)) {
      if (currentUser && (isEmailVerified || currentUser.emailVerified)) {
        navigate('/dashboard', { replace: true });
      } else if (!currentUser) {
        navigate('/login', { replace: true });
      }
    }
  }, [currentUser, isEmailVerified, loading, navigate]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleRefresh() {
    setChecking(true);
    try {
      const verified = await reloadUser();
      if (verified) {
        setJustVerified(true);
        toast.success('Email verified successfully! Taking you to UniFlow...');
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1200);
      } else {
        toast.error('Email not yet verified. Please click the link in your inbox and retry.');
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to check verification status.');
    } finally {
      setChecking(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setResending(true);
    try {
      await resendVerificationEmail();
      toast.success('Verification email sent! Check your inbox and spam folder.');
      setCooldown(60); // 60 seconds rate limit prevention
    } catch (err: unknown) {
      const errorMsg = (err as { code?: string; message?: string }).message ?? '';
      if (errorMsg.includes('too-many-requests')) {
        toast.error('Too many requests. Please wait a minute before trying again.');
        setCooldown(60);
      } else {
        toast.error(errorMsg || 'Failed to resend verification email.');
      }
    } finally {
      setResending(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.warn('Logout error:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">UniFlow Verification</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Your College Life, In Sync.</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-800 text-center">
          {justVerified ? (
            <div className="py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Email Verified!</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your email has been verified. Redirecting you to your timetable dashboard...
              </p>
            </div>
          ) : (
            <>
              {/* Mail Icon */}
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mx-auto mb-4 flex items-center justify-center ring-8 ring-blue-50/50 dark:ring-blue-950/30">
                <Mail className="w-8 h-8" />
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Verify your email</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                We sent a verification link to your college email address:
              </p>

              {/* Email Display */}
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 rounded-xl mb-6">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 uppercase tracking-wider mb-0.5">
                  Account Email
                </p>
                <p className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-300 break-all">
                  {currentUser?.email ?? 'student@college.edu'}
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {/* Refresh button */}
                <Button
                  onClick={handleRefresh}
                  className="w-full flex items-center justify-center gap-2"
                  loading={checking}
                >
                  <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                  Refresh Verification Status
                </Button>

                {/* Resend button */}
                <Button
                  variant="outline"
                  onClick={handleResend}
                  className="w-full flex items-center justify-center gap-2"
                  loading={resending}
                  disabled={cooldown > 0}
                >
                  <Send className="w-4 h-4" />
                  {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend Verification Email'}
                </Button>
              </div>

              {/* Informative notice */}
              <div className="p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-800 text-left text-xs text-gray-600 dark:text-gray-400 space-y-2 mb-6">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-200">How verification works:</span>
                    <ul className="list-disc pl-4 mt-1 space-y-1 text-gray-500 dark:text-gray-400">
                      <li>Check your inbox and click the verification link.</li>
                      <li>Check the Spam or Promotions folder if it doesn't appear.</li>
                      <li>Google Sign-In accounts are verified automatically.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Logout / Switch account */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out or use a different account
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
