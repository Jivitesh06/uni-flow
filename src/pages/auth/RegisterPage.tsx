import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatAuthError, FormattedAuthError } from '../../lib/authErrors';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import toast from 'react-hot-toast';

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<FormattedAuthError | null>(null);

  // Structured Chitkara Student Details
  const [section, setSection] = useState('BE-CSE-5A');
  const [universityId, setUniversityId] = useState('');
  const [batch, setBatch] = useState('2024');
  const [expectedGraduationYear, setExpectedGraduationYear] = useState('2028');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.endsWith('@chitkarauniversity.edu.in')) {
      toast.error('Only @chitkarauniversity.edu.in emails are permitted to register.');
      return;
    }

    setLoading(true);
    try {
      await signUp(trimmedEmail, password, name, {
        section,
        universityId: universityId.trim(),
        batch: batch.trim(),
        expectedGraduationYear: Number(expectedGraduationYear) || 2028,
        college: 'Chitkara University',
      });
      toast.success('Account created! A verification email has been sent to your inbox.');
      navigate('/verify-email');
    } catch (err: unknown) {
      const formatted = formatAuthError(err, 'register');
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">UniFlow — Your College Life, In Sync.</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-800">
          {authError && (
            <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-start gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
                <span className="font-semibold block text-red-950 dark:text-red-100 mb-0.5">Registration Failed</span>
                <span>{authError.message}</span>
                {authError.suggestedAction === 'enable-provider' && (
                  <div className="mt-2 pt-2 border-t border-red-200/60 dark:border-red-900/40">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      <strong>Firebase Console Step:</strong> In the Firebase Console, go to <em>Authentication &gt; Sign-in method &gt; Add new provider &gt; Email/Password</em> and toggle <strong>Enable</strong>.
                    </p>
                  </div>
                )}
                {authError.code === 'auth/email-already-in-use' && (
                  <div className="mt-2 pt-2 border-t border-red-200/60 dark:border-red-900/40">
                    <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      → Already have an account? Click here to sign in
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
              <Input
                placeholder="Alex Johnson"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (authError) setAuthError(null);
                }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Chitkara University Email
              </label>
              <Input
                type="email"
                placeholder="e.g. roll.degree24@chitkarauniversity.edu.in"
                value={email}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmail(val);
                  if (authError) setAuthError(null);
                  if (val.includes('@')) {
                    const local = val.split('@')[0];
                    const m = local.match(/(\d{3,6})\.([a-z]{2,4})(\d{2})/i);
                    if (m) {
                      if (!universityId) setUniversityId(m[1]);
                      const yr = 2000 + parseInt(m[3], 10);
                      setBatch(yr.toString());
                      setExpectedGraduationYear((yr + 4).toString());
                    }
                  }
                }}
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Must end with <code>@chitkarauniversity.edu.in</code>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Section
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="BE-CSE-5A">BE-CSE-5A</option>
                  <option value="BE-CSE-5B">BE-CSE-5B</option>
                  <option value="BE-CSE-5C">BE-CSE-5C</option>
                  <option value="BE-CSE-5D">BE-CSE-5D</option>
                  <option value="BE-CSE-5E">BE-CSE-5E</option>
                  <option value="BE-CSE-5F">BE-CSE-5F</option>
                  <option value="BE-CSE-5G">BE-CSE-5G</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  University / Roll ID
                </label>
                <Input
                  placeholder="e.g. 1260"
                  value={universityId}
                  onChange={(e) => setUniversityId(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Admission Batch
                </label>
                <Input
                  placeholder="2024"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expected Grad Year
                </label>
                <Input
                  placeholder="2028"
                  value={expectedGraduationYear}
                  onChange={(e) => setExpectedGraduationYear(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="At least 8 characters"
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
                  aria-label="Toggle password visibility"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Input
                  type={showConfirmPwd ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full mt-2" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
