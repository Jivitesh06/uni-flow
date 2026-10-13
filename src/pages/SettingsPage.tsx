import { useState, useEffect } from 'react';
import {
  User,
  Bell,
  BellRing,
  Shield,
  Trash2,
  CheckCircle2,
  Smartphone,
  Download,
  Wifi,
  WifiOff,
  Check,
  Lock,
  GraduationCap,
  Target,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  ChevronDown,
  Edit2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useCollection } from '../hooks/useFirestore';
import { useClassReminder } from '../hooks/useClassReminder';
import { ClassReminderBanner } from '../components/notifications/ClassReminderBanner';
import { IOSInstallModal } from '../components/pwa/IOSInstallModal';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import type { TimetableSlot } from '../types';
import {
  normalizeSection,
  normalizeSemester,
  deriveAcademicYears,
  formatFullSection,
  ACTIVE_COHORT_BATCH_MAP,
} from '../lib/collegeEmail.ts';
import { validateAcademicProfile } from '../lib/academicProfile.ts';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { currentUser, userProfile, updateUserProfile, deleteAccount, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const uid = currentUser?.uid ?? '';
  const { data: slots } = useCollection<TimetableSlot>(`users/${uid}/timetable`);
  const reminder = useClassReminder(slots, userProfile);

  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const { isOnline } = useNetworkStatus();

  const [displayName, setDisplayName] = useState(userProfile?.displayName ?? '');
  const [semester, setSemester] = useState<number>(() =>
    normalizeSemester(userProfile?.semester ?? 1)
  );
  const [section, setSection] = useState(() => {
    const raw = userProfile?.section || '';
    if (raw.includes('-')) {
      const match = raw.match(/[A-Za-z]$/);
      return match ? match[0].toUpperCase() : '';
    }
    return raw.toUpperCase();
  });
  const [universityId, setUniversityId] = useState(userProfile?.universityId ?? '');
  const [studentGroup, setStudentGroup] = useState<'G1' | 'G2' | 'ALL' | ''>(
    userProfile?.studentGroup || ''
  );
  const [college, setCollege] = useState(userProfile?.college ?? 'Chitkara University');
  const [target, setTarget] = useState(userProfile?.attendanceTarget ?? 75);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Synchronize form fields once authoritative profile resolves or changes (unless user actively editing)
  useEffect(() => {
    if (!hasUserEdited && userProfile) {
      if (userProfile.displayName !== undefined) setDisplayName(userProfile.displayName);
      if (userProfile.semester !== undefined) setSemester(normalizeSemester(userProfile.semester));
      if (userProfile.section) {
        const raw = userProfile.section;
        if (raw.includes('-')) {
          const match = raw.match(/[A-Za-z]$/);
          setSection(match ? match[0].toUpperCase() : raw.toUpperCase());
        } else {
          setSection(raw.toUpperCase());
        }
      }
      if (userProfile.universityId !== undefined) setUniversityId(userProfile.universityId);
      if (userProfile.studentGroup !== undefined) setStudentGroup(userProfile.studentGroup || '');
      if (userProfile.college !== undefined) setCollege(userProfile.college);
      if (userProfile.attendanceTarget !== undefined) setTarget(userProfile.attendanceTarget);
    }
  }, [userProfile, hasUserEdited]);

  // Derive admission batch and expected graduation year automatically
  const derived = deriveAcademicYears(universityId, userProfile?.email);
  const currentBatch =
    userProfile?.batch ||
    derived.admissionYear ||
    ACTIVE_COHORT_BATCH_MAP[normalizeSemester(semester)] ||
    '2024';
  const currentGradYear =
    userProfile?.expectedGraduationYear?.toString() ||
    derived.expectedGraduationYear?.toString() ||
    '2028';

  async function handleSave() {
    const validation = validateAcademicProfile({
      displayName,
      email: userProfile?.email || currentUser?.email || '',
      universityId,
      semester,
      section,
      studentGroup: studentGroup || 'ALL',
      attendanceTarget: target,
      college,
      program: userProfile?.program || 'BE-CSE',
    });

    if (!validation.isValid || !validation.cleaned) {
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError || 'Please check the highlighted fields');
      return;
    }

    const { cleaned } = validation;

    setSaving(true);
    try {
      await updateUserProfile({
        displayName: cleaned.displayName,
        semester: cleaned.semester,
        section: cleaned.section,
        studentGroup: cleaned.studentGroup === 'ALL' ? null : cleaned.studentGroup,
        universityId: cleaned.universityId,
        batch: cleaned.batch,
        expectedGraduationYear: cleaned.expectedGraduationYear,
        college: cleaned.college,
        program: cleaned.program,
        attendanceTarget: cleaned.attendanceTarget,
      });
      setHasUserEdited(false);
      setIsEditingProfile(false);
      toast.success('Profile settings updated');
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to update settings';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleInstallAction() {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome) {
        toast.success('UniFlow installed successfully!');
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      toast('To install, use your browser menu and choose "Install App" or "Add to Home Screen".', {
        icon: '📱',
      });
    }
  }

  async function handleDeleteAccount() {
    if (
      !confirm(
        'Are you completely sure? This will delete your account credentials, subject records, timetable, and attendance history.'
      )
    )
      return;
    if (!confirm('Final warning: Confirm account deletion?')) return;

    try {
      await deleteAccount();
      toast.success('Account deleted');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to delete account');
    }
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-10">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Settings
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your academic identity, targets, and preferences
          </p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* CARD 1: ACADEMIC PROFILE (Column 4 of Reference)                 */}
      {/* ================================================================ */}
      <Card className="rounded-3xl border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  Academic Profile
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {displayName || 'Student'} • {universityId || 'Roll No not set'}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingProfile((prev) => !prev)}
              className="text-xs font-bold h-8 px-3 rounded-xl border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1" />
              {isEditingProfile ? 'Cancel' : 'Edit'}
            </Button>
          </div>

          {!isEditingProfile ? (
            <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {userProfile?.program || 'BE-CSE'} · Sem {semester} · Sec {section || 'A'}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
                {studentGroup ? `Group ${studentGroup}` : 'Combined Section'}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                Batch {currentBatch}
              </span>
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Full Name</label>
                <Input
                  value={displayName}
                  onChange={(e) => {
                    setHasUserEdited(true);
                    setDisplayName(e.target.value);
                  }}
                  placeholder="e.g. Alex Johnson"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    University / Roll ID
                  </label>
                  <Input
                    placeholder="e.g. 2411981260"
                    value={universityId}
                    onChange={(e) => {
                      setHasUserEdited(true);
                      setUniversityId(e.target.value);
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Current Semester
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => {
                      setHasUserEdited(true);
                      setSemester(Number(e.target.value));
                    }}
                    className="w-full mt-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Section</label>
                  <Input
                    placeholder="e.g. A"
                    value={section}
                    onChange={(e) => {
                      setHasUserEdited(true);
                      setSection(e.target.value.toUpperCase());
                    }}
                    maxLength={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Student Group</label>
                  <select
                    value={studentGroup}
                    onChange={(e) => {
                      setHasUserEdited(true);
                      setStudentGroup(e.target.value as 'G1' | 'G2' | 'ALL' | '');
                    }}
                    className="w-full mt-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Not Assigned / Combined Only</option>
                    <option value="G1">Group 1 (G1)</option>
                    <option value="G2">Group 2 (G2)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">College / Institution</label>
                <Input
                  placeholder="e.g. Chitkara University"
                  value={college}
                  onChange={(e) => {
                    setHasUserEdited(true);
                    setCollege(e.target.value);
                  }}
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingProfile(false)}
                  className="text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  className="text-xs font-bold px-4 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Save Profile
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* CARD 2: ATTENDANCE TARGET (Column 4 of Reference)                */}
      {/* ================================================================ */}
      <Card className="rounded-3xl border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  Attendance Target
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Target: {target}%</p>
              </div>
            </div>
            <span className="text-lg font-black text-blue-600 dark:text-blue-400">{target}%</span>
          </div>

          {/* Three Preset Buttons: 50%, 75%, 95% matching Reference */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 50, label: '50%' },
              { value: 75, label: '75%' },
              { value: 95, label: '95%' },
            ].map((preset) => {
              const isSelected = target === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    setHasUserEdited(true);
                    setTarget(preset.value);
                  }}
                  className={`py-2 px-3 rounded-2xl text-xs font-bold transition-all border text-center ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/25 ring-2 ring-blue-500/20'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Continuous Target Slider */}
          <div>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={target}
              onChange={(e) => {
                setHasUserEdited(true);
                setTarget(+e.target.value);
              }}
              className="w-full accent-blue-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* University Tip Note Box matching Reference */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200">
            <span className="text-sm shrink-0">💡</span>
            <p className="leading-relaxed">
              <strong>75%</strong> is the mandatory minimum required by most universities to appear for final exams.
            </p>
          </div>

          {hasUserEdited && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={handleSave}
                loading={saving}
                className="text-xs font-bold px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Save Target Preference
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* CARD 3: NOTIFICATIONS (Column 4 of Reference)                    */}
      {/* ================================================================ */}
      <Card className="rounded-3xl border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  Notifications
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Class reminders 10m before</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  reminder.permission === 'granted'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : reminder.permission === 'denied'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                }`}
              >
                {reminder.permission === 'granted' ? 'Enabled' : 'Action Needed'}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <ClassReminderBanner reminder={reminder} variant="card" />
          </div>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* CARD 4: APPEARANCE (Column 4 of Reference)                       */}
      {/* ================================================================ */}
      <Card className="rounded-3xl border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  Appearance
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Dark Mode</p>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-all shadow-xs"
            >
              {theme === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-purple-400" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span className="capitalize">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* CARD 5: ACCOUNT & SECURITY (Column 4 of Reference)               */}
      {/* ================================================================ */}
      <Card className="rounded-3xl border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div
            className="flex items-center justify-between gap-3 cursor-pointer"
            onClick={() => setShowAccountDetails((p) => !p)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  Account
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentUser?.email || 'Manage your account'}
                </p>
              </div>
            </div>

            <div className="p-1 rounded-lg text-slate-400">
              {showAccountDetails ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </div>
          </div>

          {/* Account Details & Danger Zone */}
          {showAccountDetails && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
              {/* PWA App status */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {isInstalled ? 'App Installed (Standalone)' : 'Install as PWA App'}
                  </span>
                </div>
                {!isInstalled && (
                  <Button size="sm" onClick={handleInstallAction} className="text-xs h-7 px-2.5 font-bold">
                    <Download className="w-3 h-3 mr-1" />
                    Install
                  </Button>
                )}
              </div>

              {/* Network Status Info */}
              <div className="flex items-center justify-between text-xs px-1 text-slate-500">
                <span className="flex items-center gap-1.5">
                  {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-600" /> : <WifiOff className="w-3.5 h-3.5 text-amber-600" />}
                  Connectivity
                </span>
                <span className={`font-semibold ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isOnline ? 'Online Sync' : 'Offline Mode'}
                </span>
              </div>

              {/* Sign Out */}
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logout()}
                  className="w-full text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" />
                  Sign Out
                </Button>
              </div>

              {/* Danger Zone */}
              <div className="pt-2 border-t border-rose-100 dark:border-rose-950/40">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Permanently Delete Account</p>
                    <p className="text-[11px] text-slate-400">Removes student records and logs</p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteAccount}
                    className="text-xs font-bold h-7 px-2.5 bg-rose-600 hover:bg-rose-700"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </div>
  );
}
