import { useState } from 'react';
import {
  User,
  Bell,
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
import { IOSInstallModal } from '../components/pwa/IOSInstallModal';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { CHITKARA_SECTIONS } from '../lib/collegeEmail';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { userProfile, updateUserProfile, deleteAccount } = useAuth();
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const { isOnline } = useNetworkStatus();

  const [displayName, setDisplayName] = useState(userProfile?.displayName ?? '');
  const [semester, setSemester] = useState(userProfile?.semester ?? '');
  const [section, setSection] = useState(userProfile?.section ?? 'BE-CSE-5A');
  const [universityId, setUniversityId] = useState(userProfile?.universityId ?? '');
  const [batch, setBatch] = useState(userProfile?.batch ?? '2024');
  const [expectedGraduationYear, setExpectedGraduationYear] = useState(
    userProfile?.expectedGraduationYear?.toString() ?? '2028'
  );
  const [college, setCollege] = useState(userProfile?.college ?? 'Chitkara University');
  const [target, setTarget] = useState(userProfile?.attendanceTarget ?? 75);
  const [saving, setSaving] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserProfile({
        displayName: displayName.trim(),
        semester: semester.trim(),
        section: section.trim(),
        universityId: universityId.trim(),
        batch: batch.trim(),
        expectedGraduationYear: Number(expectedGraduationYear) || 2028,
        college: college.trim(),
        attendanceTarget: Number(target),
      });
      toast.success('Profile settings updated');
    } catch {
      toast.error('Failed to update settings');
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
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Johnson"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Section</label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CHITKARA_SECTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">University / Roll ID</label>
              <Input
                placeholder="e.g. 1260"
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Admission Batch</label>
              <Input
                placeholder="e.g. 2024"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Graduation Year</label>
              <Input
                placeholder="e.g. 2028"
                value={expectedGraduationYear}
                onChange={(e) => setExpectedGraduationYear(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Current Semester</label>
              <Input
                placeholder="e.g. 5th Semester"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">College / Institution</label>
            <Input
              placeholder="e.g. Chitkara University"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="mt-1"
            />
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
              onChange={(e) => setTarget(+e.target.value)}
              className="w-full accent-blue-600 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>50%</span>
              <span>75% (Standard)</span>
              <span>95% (High Honor)</span>
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
