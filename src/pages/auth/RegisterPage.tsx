import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatAuthError, FormattedAuthError } from '../../lib/authErrors';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import toast from 'react-hot-toast';

import { deriveAcademicYears, normalizeSection } from '../../lib/collegeEmail.ts';
import { validateAcademicProfile } from '../../lib/academicProfile.ts';

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

  // Structured Academic Student Details
  const [semester, setSemester] = useState<number>(5);
  const [section, setSection] = useState('A');
  const [studentGroup, setStudentGroup] = useState<'G1' | 'G2' | 'ALL'>('ALL');
  const [universityId, setUniversityId] = useState('');

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

    const validation = validateAcademicProfile({
      displayName: name,
      email,
      universityId,
      semester,
      section,
      studentGroup,
    });

    if (!validation.isValid || !validation.cleaned) {
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError || 'Please correct the highlighted fields.');
      return;
    }

    const { cleaned } = validation;

    setLoading(true);
    try {
      await signUp(cleaned.email, password, cleaned.displayName, {
        universityId: cleaned.universityId,
        semester: cleaned.semester,
        section: cleaned.section,
        studentGroup: cleaned.studentGroup,
        batch: cleaned.batch,
        expectedGraduationYear: cleaned.expectedGraduationYear,
        college: cleaned.college,
        program: cleaned.program,
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
                  setEmail(e.target.value);
                  if (authError) setAuthError(null);
                }}
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Must end with <code>@chitkarauniversity.edu.in</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                University / Roll ID
              </label>
              <Input
                placeholder="e.g. 2411981260"
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Semester
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Section
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                >
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lab Group
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['G1', 'G2', 'ALL'] as const).map((grp) => (
                  <button
                    type="button"
                    key={grp}
                    onClick={() => setStudentGroup(grp)}
                    className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition ${
                      studentGroup === grp
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {grp === 'ALL' ? 'All Classes' : `Group ${grp}`}
                  </button>
                ))}
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
