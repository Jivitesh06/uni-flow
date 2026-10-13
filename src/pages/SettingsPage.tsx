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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
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
  validateSectionLetter,
  formatFullSection,
  ACTIVE_COHORT_BATCH_MAP,
} from '../lib/collegeEmail.ts';
import { validateAcademicProfile } from '../lib/academicProfile.ts';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { currentUser, userProfile, updateUserProfile, deleteAccount } = useAuth();
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
  const currentBatch = userProfile?.batch || derived.admissionYear || ACTIVE_COHORT_BATCH_MAP[normalizeSemester(semester)] || '2024';
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
        studentGroup: (cleaned.studentGroup === 'ALL' ? null : cleaned.studentGroup),
        universityId: cleaned.universityId,
        batch: cleaned.batch,
        expectedGraduationYear: cleaned.expectedGraduationYear,
        college: cleaned.college,
        program: cleaned.program,
        attendanceTarget: cleaned.attendanceTarget,
      });
      setHasUserEdited(false);
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
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Account Settings</h2>
        <p className="text-sm text-gray-500">
          Personalize your student identity, attendance policy, and app installation preferences
        </p>
      </div>

      {/* Profile info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" /> Academic & Profile Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Full Name</label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">University / Roll ID</label>
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
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Current Semester</label>
              <select
                value={semester}
                onChange={(e) => {
                  setHasUserEdited(true);
                  setSemester(Number(e.target.value));
                }}
                className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Section</label>
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
              <p className="text-[11px] text-gray-400 mt-1">
                Enter your section letter only. Derived: <strong>{formatFullSection(college.includes('CSE') ? 'BE-CSE' : 'BE-CSE', semester, section || 'A')}</strong>
              </p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Student Group</label>
              <select
                value={studentGroup}
                onChange={(e) => {
                  setHasUserEdited(true);
                  setStudentGroup(e.target.value as 'G1' | 'G2' | 'ALL' | '');
                }}
                className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Not Assigned / Combined Only</option>
                <option value="G1">Group 1 (G1)</option>
                <option value="G2">Group 2 (G2)</option>
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Used to filter group-specific lab and practical classes.
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">College / Institution</label>
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

          {/* Automatic Academic Years Display */}
          <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Admission Batch
              </p>
              <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                {currentBatch}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Auto-derived from University ID ({universityId || 'Not provided'})
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Expected Graduation Year
              </p>
              <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                {currentGradYear}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Based on confirmed 4-year engineering duration
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Target Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" /> Attendance Policy Goal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Minimum Attendance Target
              </label>
              <span className="text-lg font-black text-blue-600 dark:text-blue-400">{target}%</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Standard college requirement is 75%. UniFlow recalculates recovery estimates and absence buffers based on this threshold.
            </p>
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
              className="w-full accent-blue-600 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer"
            />

            {/* Clickable Attendance Target Presets: 50%, 75%, 95% */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { value: 50, label: '50% (Minimum)' },
                { value: 75, label: '75% (Standard)' },
                { value: 95, label: '95% (High Honor)' },
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
                    className={`py-2 px-1.5 sm:px-2 rounded-xl text-xs font-bold transition-all border text-center ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Class Reminders (10 Mins Before) Card */}
      <Card className="border-blue-100 dark:border-blue-950/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-blue-600" /> Push Notifications & Class Reminders
            </span>
            <Badge variant={reminder.permission === 'granted' ? 'success' : reminder.permission === 'denied' ? 'danger' : 'warning'}>
              {reminder.permission === 'granted' ? 'Active' : reminder.permission === 'denied' ? 'Blocked' : 'Action Needed'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ClassReminderBanner reminder={reminder} variant="card" />

          <div className="space-y-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Advance Notification Timing</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">10 minutes before class start (T - 10)</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Audio Chime Synth</span>
              <span className="font-semibold text-emerald-600">Dual-Tone Web Audio Chime (Active)</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500">Group Isolation</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {userProfile?.studentGroup ? `Group ${userProfile.studentGroup} & Combined Only` : 'All Section Classes'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-gray-500">Background Mechanism</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-right">
                Workbox Service Worker + Notification Triggers
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PWA App Installation & Offline Info Card */}
      <Card className="border-blue-100 dark:border-blue-950 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600" /> Progressive Web App & Offline
            </span>
            <Badge variant={isInstalled ? 'success' : 'default'}>
              {isInstalled ? 'Installed (Standalone)' : 'Web Browser Mode'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {isInstalled ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" /> UniFlow is installed
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-blue-600" /> Install UniFlow on your device
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {isInstalled
                  ? 'Running as a standalone native-like app with fast offline launch.'
                  : 'Add to Home Screen or Desktop for instant access and full-screen experience.'}
              </p>
            </div>

            {!isInstalled && (
              <Button size="sm" onClick={handleInstallAction} className="whitespace-nowrap font-bold">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {isIOS ? 'iOS Install Steps' : 'Install App'}
              </Button>
            )}
          </div>

          {/* Network & Cache Information */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500 flex items-center gap-1.5">
                {isOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                )}
                Network Connectivity
              </span>
              <span className={`font-semibold ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isOnline ? 'Connected (Live Sync Active)' : 'Offline (Using Local Shell)'}
              </span>
            </div>

            <div className="flex items-start justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                App Shell Offline Cache
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-right">
                Static UI & Fonts (Workbox Service Worker)
              </span>
            </div>

            <div className="flex items-start justify-between py-1.5">
              <span className="text-gray-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                Student Data Privacy
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-right max-w-[200px]">
                Zero-Trust Direct Session (Tokens never cached)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} className="px-6 font-bold">
          <CheckCircle2 className="w-4 h-4 mr-2" /> Save Preferences
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900/50 bg-red-50/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-600">
            <Shield className="w-4 h-4" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            Deleting your account permanently destroys your profile, enrolled subjects, timetable entries, and logged attendance records. This action is irreversible.
          </p>
          <Button variant="danger" size="sm" onClick={handleDeleteAccount}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete Account Permanently
          </Button>
        </CardContent>
      </Card>

      <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </div>
  );
}
