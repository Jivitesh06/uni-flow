import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { validateAcademicProfile } from '../../lib/academicProfile';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import toast from 'react-hot-toast';

export function OnboardingPage() {
  const { currentUser, userProfile, updateUserProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [universityId, setUniversityId] = useState(userProfile?.universityId || '');
  const [semester, setSemester] = useState<number>(userProfile?.semester || 5);
  const [section, setSection] = useState(userProfile?.section || 'A');
  const [studentGroup, setStudentGroup] = useState<'G1' | 'G2' | 'ALL'>(userProfile?.studentGroup || 'ALL');
  const [attendanceTarget, setAttendanceTarget] = useState<number>(userProfile?.attendanceTarget || 75);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const validation = validateAcademicProfile({
      displayName,
      email: currentUser?.email || userProfile?.email || '',
      universityId,
      semester,
      section,
      studentGroup,
      attendanceTarget,
      college: userProfile?.college || 'Chitkara University',
      program: userProfile?.program || 'BE-CSE',
    });

    if (!validation.isValid || !validation.cleaned) {
      setErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError || 'Please correct the highlighted fields.');
      return;
    }

    setLoading(true);
    try {
      await updateUserProfile(validation.cleaned);
      toast.success('Academic profile complete! Welcome to UniFlow 🎉');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to save profile. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/25">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Complete Your Academic Profile</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm max-w-sm">
            Set up your batch, semester, and section to load your accurate timetable and attendance tracker.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100 dark:border-gray-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                Full Name
              </label>
              <Input
                placeholder="Alex Johnson"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
              {errors.displayName && <p className="text-xs text-red-500 mt-1">{errors.displayName}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                Email
              </label>
              <Input
                type="email"
                value={currentUser?.email || ''}
                disabled
                className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="text-[11px] text-gray-400 mt-1">Authenticated via Google</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                University Roll Number / ID
              </label>
              <Input
                placeholder="e.g. 2411981260"
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                required
              />
              {errors.universityId ? (
                <p className="text-xs text-red-500 mt-1">{errors.universityId}</p>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1">Used to identify your academic batch.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Semester
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s}
                    </option>
                  ))}
                </select>
                {errors.semester && <p className="text-xs text-red-500 mt-1">{errors.semester}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Section
                </label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
                {errors.section && <p className="text-xs text-red-500 mt-1">{errors.section}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                Lab Group
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['G1', 'G2', 'ALL'] as const).map((grp) => (
                  <button
                    type="button"
                    key={grp}
                    onClick={() => setStudentGroup(grp)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition ${
                      studentGroup === grp
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {grp === 'ALL' ? 'All Classes' : `Group ${grp}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Filters practical lab sessions specific to your group.</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Target Attendance
                </label>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{attendanceTarget}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={attendanceTarget}
                onChange={(e) => setAttendanceTarget(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-[11px] text-gray-400">Default Chitkara University requirement is 75%.</p>
            </div>

            <Button type="submit" className="w-full mt-2" loading={loading}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Complete Profile &amp; Go to Dashboard
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500">
            <span>Wrong Google account?</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 dark:text-red-400 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
