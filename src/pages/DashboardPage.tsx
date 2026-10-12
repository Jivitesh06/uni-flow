import { useEffect, useState, useMemo } from 'react';
import {
  Clock,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Sparkles,
  Mail,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import {
  calculateAttendanceStats,
  calculateSubjectAttendance,
  canonicalizeSubjectsForAttendance,
  matchesSubjectRecord,
} from '../lib/attendanceCalculations';
import { calculateLiveClassState } from '../lib/timetableCalculations';
import { LiveClassCard } from '../components/timetable/LiveClassCard';
import { useSharedTimetable } from '../hooks/useSharedTimetable.ts';
import { useClassReminder } from '../hooks/useClassReminder';
import { ClassReminderBanner } from '../components/notifications/ClassReminderBanner';
import {
  mergeSharedAndPersonalSlots,
  buildSharedGroupId,
  TimetableGroupParams,
} from '../lib/sharedTimetable.ts';
import { isSlotApplicableToStudent, formatGroupLabel } from '../lib/collegeEmail.ts';
import type { Subject, TimetableSlot, AttendanceRecord, EmailConnection, TimetableRevision } from '../types';

export function DashboardPage() {
  const { currentUser, userProfile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Instant offline timetable caching: hydrate state from localStorage immediately on mount
  const uid = currentUser?.uid;
  const timetableCacheKey = uid ? `uniflow_cached_timetable_${uid}` : 'uniflow_cached_timetable';
  const timetableTsKey = uid ? `uniflow_cached_timetable_ts_${uid}` : 'uniflow_cached_timetable_ts';

  const [slots, setSlots] = useState<TimetableSlot[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem(timetableCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore cache parse error
    }
    return [];
  });

  const [isFirestoreLoaded, setIsFirestoreLoaded] = useState(false);
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [lastSyncedText, setLastSyncedText] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const ts = localStorage.getItem(timetableTsKey);
    if (!ts) return '';
    const diffMin = Math.floor((Date.now() - Number(ts)) / 60000);
    return diffMin <= 1 ? 'just now' : `${diffMin}m ago`;
  });

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [pendingRevisions, setPendingRevisions] = useState<TimetableRevision[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [dismissOnboarding, setDismissOnboarding] = useState(() => {
    return localStorage.getItem('uniflow_dismiss_onboarding') === 'true';
  });

  // 1-second live clock ticker with tab focus / visibility wakeup listeners
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 1000);

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        tick();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const currentUid = currentUser.uid;

    // Load from cache if switching accounts
    try {
      const cached = localStorage.getItem(`uniflow_cached_timetable_${currentUid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSlots(parsed);
        }
      }
      const ts = localStorage.getItem(`uniflow_cached_timetable_ts_${currentUid}`);
      if (ts) {
        const diffMin = Math.floor((Date.now() - Number(ts)) / 60000);
        setLastSyncedText(diffMin <= 1 ? 'just now' : `${diffMin}m ago`);
      }
    } catch {
      // cache parsing failed safely
    }

    const unsub1 = onSnapshot(collection(db, `users/${currentUid}/subjects`), (s) =>
      setSubjects(s.docs.map((d) => ({ id: d.id, ...d.data() } as Subject)))
    );

    const unsub2 = onSnapshot(
      query(collection(db, `users/${currentUid}/timetable`), where('isActive', '==', true)),
      (s) => {
        const freshSlots = s.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableSlot));
        setSlots(freshSlots);
        setIsFirestoreLoaded(true);
        try {
          localStorage.setItem(`uniflow_cached_timetable_${currentUid}`, JSON.stringify(freshSlots));
          localStorage.setItem(`uniflow_cached_timetable_ts_${currentUid}`, Date.now().toString());
          setLastSyncedText('just now');
        } catch {
          // storage quota exceeded or disabled
        }
      },
      (err) => {
        console.warn('Firestore timetable listener error:', err);
        setIsFirestoreLoaded(true);
      }
    );

    const unsub3 = onSnapshot(
      query(collection(db, `users/${currentUid}/attendance`), orderBy('date', 'desc')),
      (s) => setAttendance(s.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord)))
    );

    const unsub4 = onSnapshot(
      collection(db, `users/${currentUid}/emailConnections`),
      (s) => setConnections(s.docs.map((d) => ({ id: d.id, ...d.data() } as EmailConnection)))
    );

    const unsub5 = onSnapshot(
      query(collection(db, 'timetableRevisions'), where('uid', '==', currentUid), where('status', '==', 'pending_review')),
      (s) => setPendingRevisions(s.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableRevision)))
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, [currentUser]);

  // Shared Timetable Group subscription
  const groupParams: TimetableGroupParams | null = useMemo(() => {
    if (!userProfile?.section) return null;
    return {
      institution: userProfile.college || 'Chitkara University',
      program: userProfile.program || 'BE-CSE',
      batch: userProfile.batch || '2024',
      semester: userProfile.semester || 5,
      section: userProfile.section,
    };
  }, [userProfile?.college, userProfile?.program, userProfile?.batch, userProfile?.semester, userProfile?.section]);

  const { sharedDoc } = useSharedTimetable(groupParams);

  // Merge shared published timetable with personal student additions (preserving manual classes)
  const effectiveSlots = useMemo(() => {
    return mergeSharedAndPersonalSlots(
      sharedDoc?.slots || [],
      slots,
      groupParams ? buildSharedGroupId(groupParams) : undefined
    );
  }, [sharedDoc?.slots, slots, groupParams]);

  const studentGroup = userProfile?.studentGroup;

  // Filter slots applicable to this student based on group scope (G1, G2, or ALL)
  const studentApplicableSlots = useMemo(() => {
    return effectiveSlots.filter((s) => isSlotApplicableToStudent(s.group, studentGroup));
  }, [effectiveSlots, studentGroup]);

  const todayDay = now.getDay();

  // Group-specific slots today if student has not selected a group yet
  const unassignedGroupSlotsToday = useMemo(() => {
    if (studentGroup) return [];
    return effectiveSlots.filter(
      (s) => s.dayOfWeek === todayDay && (s.group === 'G1' || s.group === 'G2')
    );
  }, [effectiveSlots, todayDay, studentGroup]);

  const todaySlots = studentApplicableSlots
    .filter((s) => s.dayOfWeek === todayDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const currentSlot = todaySlots.find((s) => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const start = new Date();
    start.setHours(sh, sm, 0, 0);
    const end = new Date();
    end.setHours(eh, em, 0, 0);
    return now >= start && now <= end;
  });

  const nextSlot = todaySlots.find((s) => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const start = new Date();
    start.setHours(sh, sm, 0, 0);
    return start > now;
  });

  // Calculate free slots for today (9 AM to 5 PM window)
  const freeSlots: { start: string; end: string }[] = [];
  if (todaySlots.length > 0) {
    const sorted = [...todaySlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (sorted[0].startTime > '09:00') {
      freeSlots.push({ start: '09:00', end: sorted[0].startTime });
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].endTime < sorted[i + 1].startTime) {
        freeSlots.push({ start: sorted[i].endTime, end: sorted[i + 1].startTime });
      }
    }
    if (sorted[sorted.length - 1].endTime < '17:00') {
      freeSlots.push({ start: sorted[sorted.length - 1].endTime, end: '17:00' });
    }
  }

  const target = userProfile?.attendanceTarget ?? 75;

  // Derive subjects list automatically from user subjects and authoritative shared slots,
  // canonicalizing -FA suffixes (e.g. ADI-FA -> ADI) under their unified attendance subject
  const displaySubjects = useMemo(() => {
    return canonicalizeSubjectsForAttendance(subjects, effectiveSlots, currentUser?.uid);
  }, [subjects, effectiveSlots, currentUser?.uid]);

  const subjectAttendanceMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateSubjectAttendance>>();
    for (const sub of displaySubjects) {
      const subRecords = attendance.filter((a) => matchesSubjectRecord(sub, a.subjectId));
      map.set(
        sub.id,
        calculateSubjectAttendance(sub, subRecords, target / 100, null, studentGroup)
      );
    }
    return map;
  }, [displaySubjects, attendance, target, studentGroup]);

  let overallAttended = 0;
  let overallConducted = 0;
  for (const agg of subjectAttendanceMap.values()) {
    overallAttended += agg.totalAttended;
    overallConducted += agg.totalConducted;
  }
  const overallPct = overallConducted > 0 ? (overallAttended / overallConducted) * 100 : 0;

  const atRisk = displaySubjects.filter((sub) => {
    const agg = subjectAttendanceMap.get(sub.id);
    return agg ? !agg.stats.isOnTrack : false;
  });

  // Group-aware live class state: calculates current and upcoming classes strictly for this student
  const liveState = useMemo(() => {
    return calculateLiveClassState(studentApplicableSlots, now);
  }, [studentApplicableSlots, now]);

  const isStale = (!isFirestoreLoaded && effectiveSlots.length > 0) || isOffline;
  const dateFormatted = format(now, 'EEEE, MMMM d, yyyy');
  const timeFormatted = format(now, 'h:mm:ss a');

  const gmailConnected = connections.some((c) => c.status === 'connected');

  // Smart 10-Minute Class Reminder Engine (with sound chime & push)
  const reminder = useClassReminder(studentApplicableSlots, userProfile);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top greeting banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-blue-500/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              {format(now, 'EEEE, MMM d')}
            </span>
            {userProfile?.semester && (
              <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold">
                Sem {userProfile.semester} {userProfile.section ? `• Sec ${userProfile.section}` : ''}
              </span>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {userProfile?.displayName?.split(' ')[0] ?? 'Student'}!
          </h2>
          <p className="text-blue-100 text-sm mt-1 max-w-xl">
            You have <span className="font-semibold text-white">{todaySlots.length} classes</span> scheduled today. Target threshold is{' '}
            <span className="font-semibold text-white">{target}%</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/attendance">
            <Button variant="secondary" className="bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-sm">
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-blue-600" />
              Mark Attendance
            </Button>
          </Link>
          <Link to="/timetable">
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 font-semibold">
              <Calendar className="w-4 h-4 mr-1.5" />
              Timetable
            </Button>
          </Link>
        </div>
      </div>

      {/* 10-Minute Class Reminders Banner */}
      <ClassReminderBanner reminder={reminder} />

      {/* Prominent Timetable-Aware Live Class Dashboard Hero */}
      <LiveClassCard
        liveState={liveState}
        dateFormatted={dateFormatted}
        timeFormatted={timeFormatted}
        isStale={isStale}
        lastSyncedText={lastSyncedText}
      />

      {/* First-time Student Onboarding Guide */}
      {effectiveSlots.length === 0 && !dismissOnboarding && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 border border-blue-200 dark:border-blue-900/60 rounded-3xl p-6 shadow-sm"
        >
          <button
            onClick={() => {
              setDismissOnboarding(true);
              localStorage.setItem('uniflow_dismiss_onboarding', 'true');
            }}
            className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-800 transition"
            title="Dismiss guide"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              <Sparkles className="w-3.5 h-3.5" /> Quick Setup Guide
            </span>
            <span className="text-xs text-gray-500">3 simple steps to get started</span>
          </div>

          <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">
            Welcome to UniFlow — Let's set up your semester!
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 max-w-2xl mb-5">
            Follow these quick steps to automate your college schedule, monitor mandatory 75% attendance limits, and sync weekly revisions.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-blue-100 dark:border-gray-700/60 flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center mb-3">
                  1
                </div>
                <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">Add Your Subjects</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Enter course codes, credits, and subject names to track attendance thresholds.
                </p>
              </div>
              <Link to="/subjects" className="mt-4">
                <Button size="sm" className="w-full text-xs font-semibold">
                  Add Subjects <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-blue-100 dark:border-gray-700/60 flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center mb-3">
                  2
                </div>
                <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">Set Up Timetable</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Configure your weekly class slots manually or import an Excel/CSV timetable sheet.
                </p>
              </div>
              <Link to="/timetable" className="mt-4">
                <Button size="sm" variant="outline" className="w-full text-xs font-semibold">
                  Configure Schedule <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800/80 border border-blue-100 dark:border-gray-700/60 flex flex-col justify-between">
              <div>
                <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center mb-3">
                  3
                </div>
                <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">Connect College Email</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Sync Gmail to automatically detect weekly timetable PDF revisions and holiday changes.
                </p>
              </div>
              <Link to="/email-sync" className="mt-4">
                <Button size="sm" variant="outline" className="w-full text-xs font-semibold">
                  Connect Email <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Pending Weekly Timetable Revisions Banner */}
      {pendingRevisions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-300 dark:border-amber-700/60 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Weekly Timetable Revision Waiting for Approval
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 font-bold">
                  {pendingRevisions.length} ready
                </span>
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                Found {pendingRevisions.length} new weekly schedule revision from your college emails ({pendingRevisions[0].weekLabel || 'Weekly Update'}). Review added, cancelled, or shifted classes before updating your active timetable.
              </p>
            </div>
          </div>
          <Link to="/email-sync" className="w-full sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto whitespace-nowrap bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm">
              Review Changes
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Overall Attendance',
            value: overallConducted > 0 ? `${overallPct.toFixed(1)}%` : 'N/A',
            sub: overallConducted > 0 ? `${overallAttended}/${overallConducted} lectures` : 'No data yet',
            icon: TrendingUp,
            color: overallPct >= target ? 'text-green-600 dark:text-green-400' : 'text-red-500',
            bg: overallPct >= target ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30',
          },
          {
            label: 'Enrolled Subjects',
            value: subjects.length,
            sub: `${subjects.reduce((sum, s) => sum + (s.credits || 0), 0)} total credits`,
            icon: BookOpen,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-50 dark:bg-blue-950/30',
          },
          {
            label: "Today's Schedule",
            value: `${todaySlots.length} Classes`,
            sub: currentSlot ? 'Lecture in progress' : nextSlot ? `Next at ${nextSlot.startTime}` : 'Completed',
            icon: Calendar,
            color: 'text-purple-600 dark:text-purple-400',
            bg: 'bg-purple-50 dark:bg-purple-950/30',
          },
          {
            label: 'Subjects at Risk',
            value: atRisk.length,
            sub: atRisk.length > 0 ? 'Requires attention' : 'All above target',
            icon: AlertTriangle,
            color: atRisk.length > 0 ? 'text-amber-500' : 'text-emerald-500',
            bg: atRisk.length > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30',
          },
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{stat.label}</p>
                    <p className={`text-2xl font-black mt-1.5 ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{stat.sub}</p>
                  </div>
                  <div className={`p-3 rounded-2xl ${stat.bg}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Today's Full Lecture Timeline & Free Slot Finder (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Schedule Timeline & Free Slots */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Today's Lecture Schedule
                </CardTitle>
                <Link to="/timetable" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                  Full timetable <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {unassignedGroupSlotsToday.length > 0 && (
                <div className="p-3 mb-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div>
                    <span className="font-bold">Group Labs Today:</span> Your section has {unassignedGroupSlotsToday.length} group-specific lab class(es) today. Set your group in Settings to show your specific lab schedule and track attendance.
                  </div>
                  <Link to="/settings" className="shrink-0">
                    <Button size="sm" variant="outline" className="text-xs h-7 border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 font-bold">
                      Set Group
                    </Button>
                  </Link>
                </div>
              )}

              {todaySlots.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No lecture slots found for today.</p>
              ) : (
                <div className="space-y-3">
                  {todaySlots.map((slot) => {
                    const [sh, sm] = slot.startTime.split(':').map(Number);
                    const [eh, em] = slot.endTime.split(':').map(Number);
                    const start = new Date();
                    start.setHours(sh, sm, 0, 0);
                    const end = new Date();
                    end.setHours(eh, em, 0, 0);
                    const isNow = now >= start && now <= end;
                    const isPast = now > end;

                    return (
                      <div
                        key={slot.id}
                        className={`flex items-center gap-4 p-3.5 rounded-2xl border transition-all ${
                          isNow
                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm'
                            : isPast
                            ? 'border-gray-100 dark:border-gray-800 opacity-60'
                            : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'
                        }`}
                      >
                        <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: slot.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate text-gray-900 dark:text-white">
                              {slot.subjectName}
                            </p>
                            {slot.group && slot.group !== 'ALL' && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                slot.group === 'G1'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                              }`}>
                                {slot.group}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {slot.startTime} – {slot.endTime} {slot.room && `• Room ${slot.room}`} {slot.faculty && `• ${slot.faculty}`}
                          </p>
                        </div>
                        {isNow && <Badge variant="success">Now</Badge>}
                        {isPast && <Badge variant="default">Done</Badge>}
                        {!isNow && !isPast && <Badge variant="info">Upcoming</Badge>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Free Slot Finder */}
              {freeSlots.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h4 className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Free Slots Today (Study / Break)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {freeSlots.map((fs, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-900/50"
                      >
                        ☕ {fs.start} – {fs.end}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Subject Attendance Pulse & Email Status */}
        <div className="space-y-6">
          {/* Subject Attendance Highlights */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Subject Attendance Pulse
                </CardTitle>
                <Link to="/attendance" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  All
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {displaySubjects.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-gray-400">No subjects added yet.</p>
                  <Link to="/subjects">
                    <Button variant="outline" size="sm" className="mt-2 text-xs">
                      Add Subjects
                    </Button>
                  </Link>
                </div>
              ) : (
                displaySubjects.slice(0, 5).map((sub) => {
                  const agg = subjectAttendanceMap.get(sub.id) || calculateSubjectAttendance(sub, [], target / 100);
                  const { totalAttended, totalConducted, stats } = agg;

                  return (
                    <div key={sub.id} className="space-y-1.5 p-3 rounded-xl bg-gray-50/70 dark:bg-gray-800/40">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[140px]">{sub.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${stats.isOnTrack ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                            {stats.percentage.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-gray-400">({totalAttended}/{totalConducted})</span>
                        </div>
                      </div>
                      <Progress value={stats.percentage} />
                      <p className="text-[11px] text-gray-500 flex items-center justify-between">
                        {stats.isOnTrack ? (
                          <span className="text-green-600 dark:text-green-400">Can safely miss {stats.maxAbsences} classes</span>
                        ) : (
                          <span className="text-red-500 font-semibold">Must attend {stats.classesNeeded} classes</span>
                        )}
                        <span className="text-gray-400">{sub.code}</span>
                      </p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Email Sync Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Timetable Sync
                </span>
                <Badge variant={gmailConnected ? 'success' : 'default'}>
                  {gmailConnected ? 'Connected' : 'Manual Mode'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                {gmailConnected
                  ? 'Your Gmail is synced. Incoming college timetable emails are scanned automatically.'
                  : 'Connect your college Gmail or upload your timetable document to detect schedule revisions automatically.'}
              </p>
              <Link to="/email-sync">
                <Button variant="outline" size="sm" className="w-full text-xs">
                  {gmailConnected ? 'Manage Email Connection' : 'Setup Gmail Integration'}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
